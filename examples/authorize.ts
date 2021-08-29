import { Client } from "../mod.ts";

const client = new Client({
  id: Deno.env.get("CLIENT_ID")!,
  secret: Deno.env.get("CLIENT_SECRET")!,
  scopes: ["rpc"],
});

await client.connect();

const { access_token: token } = await client.authorize();
console.log("Authorized! Token:", token);
