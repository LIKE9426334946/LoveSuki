import { createReadStream } from "node:fs";
import { renderMarkdown } from "../services/markdown-renderer.js";
import { ApiError, readJsonBody, requireText, sendJson } from "../utils/http.js";

const ARTICLE_CONTENT_LIMIT = 10_000_000;

function parseRange(rangeHeader, size) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) return { invalid: true };

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return { invalid: true };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) {
    return { invalid: true };
  }
  return { start, end: Math.min(end, size - 1) };
}

function sendAudio(request, response, audio) {
  const range = parseRange(request.headers.range, audio.size);
  if (range?.invalid) {
    response.writeHead(416, {
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes */${audio.size}`,
      "X-Content-Type-Options": "nosniff"
    });
    response.end();
    return;
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? audio.size - 1;
  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-cache",
    "Content-Length": end - start + 1,
    "Content-Type": audio.contentType,
    "X-Content-Type-Options": "nosniff"
  };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${audio.size}`;
  response.writeHead(range ? 206 : 200, headers);

  const stream = createReadStream(audio.filePath, { start, end });
  stream.on("error", () => response.destroy());
  stream.pipe(response);
}

export function createApiRouter({ libraryStore, authService, articleScheduler }) {
  return async function handleApiRequest(request, response) {
    const url = new URL(request.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { status: "ok", service: "LoveSuki" });
        return true;
      }

      if (authService && !authService.isAuthenticated(request)) {
        throw new ApiError(401, "登录状态已失效，请重新登录。");
      }

      if (request.method === "GET" && url.pathname === "/api/library") {
        sendJson(response, 200, libraryStore.listLibrary());
        return true;
      }

      if (request.method === "GET" && url.pathname === "/api/settings") {
        sendJson(response, 200, { settings: libraryStore.getSettings() });
        return true;
      }

      if (request.method === "PATCH" && url.pathname === "/api/settings") {
        const body = await readJsonBody(request);
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw new ApiError(400, "设置内容格式不正确。");
        }
        const changes = {};

        if (Object.hasOwn(body, "dailyArticleSyncEnabled")) {
          if (typeof body.dailyArticleSyncEnabled !== "boolean") {
            throw new ApiError(400, "每日文章同步开关必须是布尔值。");
          }
          changes.dailyArticleSyncEnabled = body.dailyArticleSyncEnabled;
        }

        if (Object.hasOwn(body, "dailyArticleOrder")) {
          if (!["ascending", "descending"].includes(body.dailyArticleOrder)) {
            throw new ApiError(400, "文章顺序只能设置为顺序或逆序。");
          }
          changes.dailyArticleOrder = body.dailyArticleOrder;
        }

        const settings = await libraryStore.updateSettings(changes);
        articleScheduler?.refresh();
        sendJson(response, 200, { settings });
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

      const articleAudioMatch = url.pathname.match(/^\/api\/articles\/([^/]+)\/audio$/);
      if (articleAudioMatch && request.method === "GET") {
        const audio = await libraryStore.getArticleAudio(decodeURIComponent(articleAudioMatch[1]));
        sendAudio(request, response, audio);
        return true;
      }

      if (articleAudioMatch && request.method === "PUT") {
        let originalName;
        try {
          originalName = decodeURIComponent(String(request.headers["x-audio-file-name"] || "文章音频"));
        } catch {
          throw new ApiError(400, "音频文件名格式不正确。");
        }
        const audio = await libraryStore.saveArticleAudio(decodeURIComponent(articleAudioMatch[1]), {
          stream: request,
          contentType: request.headers["content-type"],
          originalName,
          declaredBytes: Number(request.headers["content-length"] || 0)
        });
        sendJson(response, 201, { audio });
        return true;
      }

      if (articleAudioMatch && request.method === "DELETE") {
        const result = await libraryStore.deleteArticleAudio(decodeURIComponent(articleAudioMatch[1]));
        sendJson(response, 200, result);
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
