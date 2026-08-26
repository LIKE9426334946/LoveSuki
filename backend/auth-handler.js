import { ApiError, readJsonBody, sendJson } from "./utils/http.js";

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 8;

function getClientAddress(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket?.remoteAddress || "unknown";
}

export function createAuthHandler({ authService, now = () => Date.now() }) {
  const failedAttempts = new Map();

  function getAttemptState(key) {
    const currentTime = now();
    for (const [address, state] of failedAttempts) {
      if (currentTime - state.startedAt >= ATTEMPT_WINDOW_MS) failedAttempts.delete(address);
    }

    const existing = failedAttempts.get(key);
    if (!existing) return { count: 0, startedAt: currentTime };
    return existing;
  }

  return async function handleAuthRequest(request, response) {
    const url = new URL(request.url, "http://localhost");
    if (!url.pathname.startsWith("/api/auth/")) return false;

    try {
      if (request.method === "GET" && url.pathname === "/api/auth/session") {
        const session = authService.getSession(request);
        sendJson(response, 200, session
          ? { authenticated: true, username: session.username, expiresAt: session.expiresAt }
          : { authenticated: false });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        const address = getClientAddress(request);
        const attemptState = getAttemptState(address);
        if (attemptState.count >= MAX_FAILED_ATTEMPTS) {
          throw new ApiError(429, "登录尝试过于频繁，请稍后再试。");
        }

        const body = await readJsonBody(request, 8 * 1024);
        if (!authService.verifyCredentials(body.username, body.password)) {
          failedAttempts.set(address, {
            count: attemptState.count + 1,
            startedAt: attemptState.startedAt
          });
          throw new ApiError(401, "用户名或密码错误。");
        }

        failedAttempts.delete(address);
        response.setHeader("Set-Cookie", authService.createSessionCookie(request));
        sendJson(response, 200, { authenticated: true, username: "noart", expiresInDays: 30 });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        response.setHeader("Set-Cookie", authService.createExpiredCookie(request));
        sendJson(response, 200, { authenticated: false });
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
