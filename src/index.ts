import { defineServer, defineRoom } from "colyseus";
import { config } from "./config.js";
import { FindTheBotRoom } from "./game/room.js";

const server = defineServer({
  rooms: {
    find_the_bot: defineRoom(FindTheBotRoom),
  },
});

server.listen(config.port);
console.log(`Find the Bot backend listening on port ${config.port}`);
