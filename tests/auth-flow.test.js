import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApiRouter } from "../backend/api/router.js";
import { createAuthHandler } from "../backend/auth-handler.js";
import { AuthService } from "../backend/services/auth-service.js";
import { LibraryStore } from "../backend/services/library-store.js";
import { createStaticHandler } from "../backend/static-handler.js";

async function withAuthenticatedServer(run) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "lovesuki-auth-flow-"));
  const libraryStore = new LibraryStore(dataDirectory);
  const authService = new AuthService(dataDirectory);
  await libraryStore.initialize();
  await authService.initialize();
  authService.verifyCredentials = (username, password) => {
    return username === "test-user" && password === "test-password";
  };

  const handleAuthRequest = createAuthHandler({ authService });
  const handleApiRequest = createApiRouter({ libraryStore, authService });
  const handleStaticRequest = createStaticHandler({
    isAuthenticated: (request) => authService.isAuthenticated(request)
  });
  const server = createServer(async (request, response) => {
    if (await handleAuthRequest(request, response)) return;
    if (await handleApiRequest(request, response)) return;
    await handleStaticRequest(request, response);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dataDirectory, { recursive: true, force: true });
  }
}

test("requires login for both pages and all article APIs", async () => {
  await withAuthenticatedServer(async (baseUrl) => {
    for (const page of ["/", "/admin"]) {
      const response = await fetch(`${baseUrl}${page}`, { redirect: "manual" });
      assert.equal(response.status, 302);
      assert.match(response.headers.get("location"), /^\/login\?next=/);
    }

    const loginPage = await fetch(`${baseUrl}/login`);
    assert.equal(loginPage.status, 200);
    assert.match(await loginPage.text(), /id="loginForm"/);

    const protectedApi = await fetch(`${baseUrl}/api/library`);
    assert.equal(protectedApi.status, 401);

    const wrongLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "test-user", password: "wrong" })
    });
    assert.equal(wrongLogin.status, 401);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "test-user", password: "test-password" })
    });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie");
    assert.match(setCookie, /lovesuki_session=/);
    assert.match(setCookie, /Max-Age=2592000/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(";")[0];

    for (const page of ["/", "/admin"]) {
      const response = await fetch(`${baseUrl}${page}`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200);
    }

    const library = await fetch(`${baseUrl}/api/library`, { headers: { Cookie: cookie } });
    assert.equal(library.status, 200);

    const session = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } });
    const sessionData = await session.json();
    assert.equal(sessionData.authenticated, true);
    assert.equal(sessionData.username, "noart");
    assert.ok(Number.isInteger(sessionData.expiresAt));

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie }
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  });
});
