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

  const schedulerState = { refreshes: 0 };
  const handleAuthRequest = createAuthHandler({ authService });
  const handleApiRequest = createApiRouter({
    libraryStore,
    authService,
    articleScheduler: { refresh() { schedulerState.refreshes += 1; } }
  });
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
    await run(`http://127.0.0.1:${address.port}`, schedulerState);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dataDirectory, { recursive: true, force: true });
  }
}

test("requires login for both pages and all article APIs", async () => {
  await withAuthenticatedServer(async (baseUrl, schedulerState) => {
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
    const libraryData = await library.json();

    const settingsResponse = await fetch(`${baseUrl}/api/settings`, { headers: { Cookie: cookie } });
    assert.equal(settingsResponse.status, 200);
    assert.deepEqual((await settingsResponse.json()).settings, {
      dailyArticleSyncEnabled: true,
      dailyArticleOrder: "ascending",
      typingSpeedMs: 50
    });

    const updateSettings = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ dailyArticleSyncEnabled: false, dailyArticleOrder: "descending" })
    });
    assert.equal(updateSettings.status, 200);
    assert.deepEqual((await updateSettings.json()).settings, {
      dailyArticleSyncEnabled: false,
      dailyArticleOrder: "descending",
      typingSpeedMs: 50
    });
    assert.equal(schedulerState.refreshes, 1);

    const updateSpeed = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ typingSpeedMs: 180 })
    });
    assert.equal(updateSpeed.status, 200);
    assert.equal((await updateSpeed.json()).settings.typingSpeedMs, 180);
    assert.equal(schedulerState.refreshes, 1);

    const invalidSpeed = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ typingSpeedMs: 501 })
    });
    assert.equal(invalidSpeed.status, 400);

    const createArticle = await fetch(`${baseUrl}/api/articles`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        directoryId: libraryData.directories[0].id,
        title: "Audio test",
        content: "Audio article"
      })
    });
    assert.equal(createArticle.status, 201);
    const { article } = await createArticle.json();

    const renameArticle = await fetch(`${baseUrl}/api/articles/${article.id}/title`, {
      method: "PATCH",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed audio test" })
    });
    assert.equal(renameArticle.status, 200);
    assert.equal((await renameArticle.json()).article.title, "Renamed audio test");
    const renamedArticle = await fetch(`${baseUrl}/api/articles/${article.id}`, {
      headers: { Cookie: cookie }
    });
    assert.equal((await renamedArticle.json()).article.content, "Audio article");

    const audioPayload = Buffer.from("test-audio-payload");
    const uploadAudio = await fetch(`${baseUrl}/api/articles/${article.id}/audio`, {
      method: "PUT",
      headers: {
        Cookie: cookie,
        "Content-Type": "audio/mpeg",
        "X-Audio-File-Name": encodeURIComponent("lesson.mp3")
      },
      body: audioPayload
    });
    assert.equal(uploadAudio.status, 201);
    assert.equal((await uploadAudio.json()).audio.originalName, "lesson.mp3");

    const streamAudio = await fetch(`${baseUrl}/api/articles/${article.id}/audio`, {
      headers: { Cookie: cookie, Range: "bytes=5-9" }
    });
    assert.equal(streamAudio.status, 206);
    assert.equal(streamAudio.headers.get("accept-ranges"), "bytes");
    assert.equal(streamAudio.headers.get("content-range"), `bytes 5-9/${audioPayload.length}`);
    assert.deepEqual(Buffer.from(await streamAudio.arrayBuffer()), audioPayload.subarray(5, 10));

    const deleteAudio = await fetch(`${baseUrl}/api/articles/${article.id}/audio`, {
      method: "DELETE",
      headers: { Cookie: cookie }
    });
    assert.equal(deleteAudio.status, 200);

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
