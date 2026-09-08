import { createServer } from "node:http";
import { setDefaultResultOrder } from "node:dns";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiRouter } from "./api/router.js";
import { createAuthHandler } from "./auth-handler.js";
import { AuthService } from "./services/auth-service.js";
import { DailyArticleScheduler } from "./services/daily-article-scheduler.js";
import { GitHubArticleSync } from "./services/github-article-sync.js";
import { LibraryStore } from "./services/library-store.js";
import { createStaticHandler } from "./static-handler.js";

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "3023", 10);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = process.env.DATA_DIR || path.resolve(currentDirectory, "../data");

setDefaultResultOrder("ipv4first");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const libraryStore = new LibraryStore(dataDirectory);
await libraryStore.initialize();
await libraryStore.organizeImportedDailyArticles();
const authService = new AuthService(dataDirectory);
await authService.initialize();
const articleSync = new GitHubArticleSync({ libraryStore });
const articleScheduler = new DailyArticleScheduler({
  articleSync,
  isEnabled: () => libraryStore.getSettings().dailyArticleSyncEnabled
});
const handleAuthRequest = createAuthHandler({ authService });
const handleApiRequest = createApiRouter({ libraryStore, authService, articleScheduler });
const handleStaticRequest = createStaticHandler({
  isAuthenticated: (request) => authService.isAuthenticated(request)
});

const server = createServer(async (request, response) => {
  if (await handleAuthRequest(request, response)) return;
  if (await handleApiRequest(request, response)) return;

  await handleStaticRequest(request, response);
});

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(port, host, () => {
  console.log(`LoveSuki is running at http://${host}:${port}`);
  articleScheduler.start();
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down LoveSuki...`);
  articleScheduler.stop();
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
