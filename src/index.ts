import { Server } from "colyseus";
import { config } from "./config.js";
import { FindTheBotRoom } from "./game/room.js";

const server = new Server();
server.define("find_the_bot", FindTheBotRoom);

async function main(): Promise<void> {
  await server.listen(config.port);
  console.log(`Find the Bot backend listening on port ${config.port}`);
}

void main().catch((error: unknown) => {
  console.error("Failed to start backend", error);
  process.exitCode = 1;
});
