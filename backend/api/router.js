import { renderMarkdown } from "../services/markdown-renderer.js";
import { ApiError, readJsonBody, requireText, sendJson } from "../utils/http.js";

const ARTICLE_CONTENT_LIMIT = 10_000_000;

export function createApiRouter({ libraryStore }) {
  return async function handleApiRequest(request, response) {
    const url = new URL(request.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { status: "ok", service: "LoveSuki" });
        return true;
      }

      if (request.method === "GET" && url.pathname === "/api/library") {
        sendJson(response, 200, libraryStore.listLibrary());
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/directories") {
        const body = await readJsonBody(request);
        const directory = await libraryStore.createDirectory(
          requireText(body.name, "目录名称", 80)
        );
        sendJson(response, 201, { directory });
        return true;
      }

      const directoryMatch = url.pathname.match(/^\/api\/directories\/([^/]+)$/);
      if (directoryMatch && request.method === "PATCH") {
        const body = await readJsonBody(request);
        const directory = await libraryStore.renameDirectory(
          decodeURIComponent(directoryMatch[1]),
          requireText(body.name, "目录名称", 80)
        );
        sendJson(response, 200, { directory });
        return true;
      }

      if (directoryMatch && request.method === "DELETE") {
        const result = await libraryStore.deleteDirectory(decodeURIComponent(directoryMatch[1]));
        sendJson(response, 200, result);
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/articles") {
        const body = await readJsonBody(request);
        const article = await libraryStore.createArticle({
          directoryId: requireText(body.directoryId, "目录", 80),
          title: requireText(body.title, "文章标题", 120),
          content: requireText(body.content ?? "", "文章内容", ARTICLE_CONTENT_LIMIT, { allowEmpty: true })
        });
        sendJson(response, 201, { article });
        return true;
      }

      const articleMatch = url.pathname.match(/^\/api\/articles\/([^/]+)$/);
      if (articleMatch && request.method === "GET") {
        const article = await libraryStore.getArticle(decodeURIComponent(articleMatch[1]));
        sendJson(response, 200, { article });
        return true;
      }

      if (articleMatch && request.method === "PATCH") {
        const body = await readJsonBody(request);
        const article = await libraryStore.updateArticle(decodeURIComponent(articleMatch[1]), {
          directoryId: requireText(body.directoryId, "目录", 80),
          title: requireText(body.title, "文章标题", 120),
          content: requireText(body.content ?? "", "文章内容", ARTICLE_CONTENT_LIMIT, { allowEmpty: true })
        });
        sendJson(response, 200, { article });
        return true;
      }

      if (articleMatch && request.method === "DELETE") {
        const result = await libraryStore.deleteArticle(decodeURIComponent(articleMatch[1]));
        sendJson(response, 200, result);
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/markdown/render") {
        const body = await readJsonBody(request);
        const content = requireText(body.content ?? "", "文章内容", ARTICLE_CONTENT_LIMIT, { allowEmpty: true });
        sendJson(response, 200, { html: renderMarkdown(content) });
        return true;
      }

      throw new ApiError(404, "接口不存在。");
    } catch (error) {
      const statusCode = error instanceof ApiError ? error.statusCode : 500;
      if (statusCode === 500) console.error(error);
      sendJson(response, statusCode, {
        error: statusCode === 500 ? "服务器处理请求时发生错误。" : error.message
      });
      return true;
    }
  };
}
