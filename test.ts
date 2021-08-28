import { createClient, OpCode } from "./mod.ts";

const CLIENT_ID = Deno.env.get("CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("CLIENT_SECRET")!;

const client = await createClient();

await client.login(CLIENT_ID);

(async () => {
  for await (const event of client) {
    if (event.type === "packet") {
      console.log("Packet:", OpCode[event.op], event.data);
      const { cmd, data } = event.data;
      if (cmd === "DISPATCH") {
        const evt = data.evt;
        if (evt === "READY") {
          await client.send(OpCode.FRAME, {
            cmd: "AUTHORIZE",
            args: {
              client_id: CLIENT_ID,
              scopes: "rpc messages.read",
              grant_type: "authorization_code",
            },
          });
        }
      }
    }
  }
})();
