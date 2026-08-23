import { createServer } from "node:http";
import { createStaticHandler } from "./static-handler.js";

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "3023", 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const handleStaticRequest = createStaticHandler();

const server = createServer(async (request, response) => {
  if (request.url === "/api/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ status: "ok", service: "LoveSuki" }));
    return;
  }

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
