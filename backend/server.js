import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiRouter } from "./api/router.js";
import { LibraryStore } from "./services/library-store.js";
import { createStaticHandler } from "./static-handler.js";

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "3023", 10);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = process.env.DATA_DIR || path.resolve(currentDirectory, "../data");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const handleStaticRequest = createStaticHandler();
const libraryStore = new LibraryStore(dataDirectory);
await libraryStore.initialize();
const handleApiRequest = createApiRouter({ libraryStore });

const server = createServer(async (request, response) => {
  if (await handleApiRequest(request, response)) return;

  await handleStaticRequest(request, response);
});

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(port, host, () => {
  console.log(`LoveSuki is running at http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down LoveSuki...`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
