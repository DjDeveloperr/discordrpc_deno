import { Activity, OpCode } from "./types.ts";
import { findIPC, encode } from "./util.ts";

const _ipcHandle = Symbol("[[ipc]]");
const _header = Symbol("[[header]]");
const _headerView = Symbol("[[headerView]]");
const _writers = Symbol("[[writers]]");
const _emit = Symbol("[[emit]]");
const _eventLoop = Symbol("[[eventLoop]]");
const _read = Symbol("[[read]]");
const _breakEventLoop = Symbol("[[breakEventLoop]]");

export async function createClient(): Promise<DiscordIPC> {
  const conn = await findIPC();
  const client = Object.create(DiscordIPC.prototype);

  client[_ipcHandle] = conn;
  client[_header] = new Uint8Array(8);
  client[_headerView] = new DataView(client[_header].buffer);
  client[_writers] = new Set();
  client[_eventLoop] = (async function () {
    try {
      while (true) {
        if (client[_breakEventLoop] === true) break;
        await client[_read]();
      }
    } catch(e) {}
  })();

  return client;
}

export interface FrameIPCEvent<T = any> {
  type: "frame";
  op: OpCode;
  data: T;
}

export interface CloseIPCEvent {
  type: "close";
}

export type IPCEvent = FrameIPCEvent | CloseIPCEvent;

export class DiscordIPC {
  [_ipcHandle]!: Deno.Conn;
  [_writers]!: Set<ReadableStreamDefaultController<IPCEvent>>;
  [_eventLoop]!: Promise<void>;
  [_breakEventLoop]?: boolean;

  constructor() {
    throw new TypeError("Use `createClient` instead of `new DiscordIPC`");
  }

  async login(client_id: string) {
    await this.send(OpCode.HANDSHAKE, { v: "1", client_id });
  }

  [_header]!: Uint8Array;
  [_headerView]!: DataView;

  async send(op: OpCode, payload: any) {
    let nonce: string;
    if (typeof payload === "object" && payload !== null) {
      if (typeof payload.nonce === "undefined") {
        nonce = crypto.randomUUID();
        payload.nonce = nonce;
      } else {
        nonce = payload.nonce;
      }
    }
    const data = encode(op, JSON.stringify(payload));
    await this[_ipcHandle].write(data);
    return nonce;
  }

  async setActivity(activity: Activity) {
    await this.send(OpCode.FRAME, {
      cmd: "SET_ACTIVITY",
      args: {
        pid: Deno.pid,
        activity,
      },
    });
  }

  async close() {
    for (const ctx of this[_writers]) {
      ctx.close();
    }
    this[_breakEventLoop] = true;
    await this[_ipcHandle].close();
    this[_emit]({ type: "close" });
  }

  [_emit](event: IPCEvent) {
    for (const ctx of this[_writers]) {
      ctx.enqueue(event);
    }
  }

  async [_read]() {
    if (await ipc[_ipcHandle]?.read(ipc[_header]) !== 8) return;
    const op = ipc[_headerView].getInt32(0, true) as OpCode;
    const payloadLength = ipc[_headerView].getInt32(4, true);
    const data = new Uint8Array(payloadLength);
    if (await ipc[_ipcHandle]?.read(data) !== payloadLength) return;
    const payload = new TextDecoder().decode(data);
    this[_emit]({ type: "frame", op, data: JSON.parse(payload) });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<IPCEvent> {
    let ctx: ReadableStreamDefaultController<IPCEvent>;
    return new ReadableStream<IPCEvent>({
      start: (controller) => {
        ctx = controller;
        this[_writers].add(ctx);
      },
      cancel: () => {
        this[_writers].delete(ctx);
      },
    })[Symbol.asyncIterator];
  }
}
