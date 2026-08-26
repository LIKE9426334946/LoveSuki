import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(currentDirectory, "../public");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};

function resolvePublicFile(url = "/") {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const requestedPath = pathname === "/"
    ? "/index.html"
    : pathname === "/admin" || pathname === "/admin/"
      ? "/admin.html"
      : pathname === "/login" || pathname === "/login/"
        ? "/login.html"
      : pathname;
  const absolutePath = path.resolve(publicDirectory, `.${requestedPath}`);

  if (absolutePath !== publicDirectory && !absolutePath.startsWith(`${publicDirectory}${path.sep}`)) {
    return null;
  }

  return absolutePath;
}

const protectedPagePaths = new Set(["/", "/index.html", "/admin", "/admin/", "/admin.html"]);

function getSafeNextPath(value) {
  return value === "/admin" || value === "/admin/" || value === "/admin.html" ? "/admin" : "/";
}

function redirect(response, location) {
  response.writeHead(302, {
    ...securityHeaders,
    "Cache-Control": "no-store",
    Location: location
  });
  response.end();
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    ...securityHeaders,
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(message);
}

export function createStaticHandler({ isAuthenticated = () => true } = {}) {
  return async function handleStaticRequest(request, response) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      sendText(response, 405, "Method Not Allowed");
      return;
    }

    let filePath;
    try {
      const url = new URL(request.url, "http://localhost");
      const authenticated = isAuthenticated(request);
      if (protectedPagePaths.has(url.pathname) && !authenticated) {
        const next = getSafeNextPath(url.pathname);
        redirect(response, `/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if ((url.pathname === "/login" || url.pathname === "/login/") && authenticated) {
        redirect(response, getSafeNextPath(url.searchParams.get("next")));
        return;
      }
      filePath = resolvePublicFile(request.url);
    } catch {
      sendText(response, 400, "Bad Request");
      return;
    }

    if (!filePath) {
      sendText(response, 403, "Forbidden");
      return;
    }

    try {
      const fileStats = await stat(filePath);
      if (!fileStats.isFile()) {
        sendText(response, 404, "Not Found");
        return;
      }

      const headers = {
        ...securityHeaders,
        "Cache-Control": /\.(?:html|css|js)$/i.test(filePath)
          ? "no-cache"
          : "public, max-age=3600",
        "Content-Length": fileStats.size,
        "Content-Type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream"
      };

      response.writeHead(200, headers);
      if (request.method === "HEAD") {
        response.end();
        return;
      }

      const stream = createReadStream(filePath);
      stream.on("error", () => {
        if (!response.headersSent) sendText(response, 500, "Internal Server Error");
        else response.destroy();
      });
      stream.pipe(response);
    } catch (error) {
      if (error?.code === "ENOENT") {
        sendText(response, 404, "Not Found");
        return;
      }
      sendText(response, 500, "Internal Server Error");
    }
  };
}
