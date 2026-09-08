import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GitHubArticleSync } from "../backend/services/github-article-sync.js";
import { LibraryStore } from "../backend/services/library-store.js";

function createResponse(body, { status = 200 } = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": typeof body === "string" ? "text/markdown" : "application/json" }
  });
}

test("requests only the selected date and stores it in its YYYY-MM directory", async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "lovesuki-sync-"));
  context.after(() => rm(dataDirectory, { recursive: true, force: true }));

  const store = new LibraryStore(dataDirectory);
  await store.initialize();
  const requests = [];
  const sync = new GitHubArticleSync({
    libraryStore: store,
    fetchImpl: async (url) => {
      requests.push(String(url));
      if (String(url).startsWith("https://api.github.com/")) {
        return createResponse({
          type: "file",
          name: "2026-09-08.md",
          path: "daily-articles/2026-09-08.md",
          sha: "article-v1",
          download_url: "https://example.test/2026-09-08.md"
        });
      }
      return createResponse("# Why We Sleep\n\nSleep helps the brain learn.");
    }
  });

  const result = await sync.syncDate("2026-09-08");
  assert.deepEqual(result, { available: true, checked: true, imported: 1, updated: 0 });
  assert.equal(requests.length, 2);
  assert.match(requests[0], /\/contents\/daily-articles\/2026-09-08\.md\?ref=main$/);
  assert.equal(requests.some((url) => url.endsWith("/contents/daily-articles?ref=main")), false);

  const monthDirectory = store.listLibrary().directories.find((item) => item.name === "2026-09");
  assert.equal(monthDirectory.articles.length, 1);
  assert.equal(monthDirectory.articles[0].title, "2026-09-08");
  assert.match((await store.getArticle(monthDirectory.articles[0].id)).content, /Why We Sleep/);

  assert.equal(sync.hasImportedDate("2026-09-08"), true);
  assert.deepEqual(await sync.syncDate("2026-09-08"), {
    available: true,
    checked: false,
    imported: 0,
    updated: 0
  });
  assert.equal(requests.length, 2);
});

test("reports an unavailable date without requesting another article", async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "lovesuki-sync-missing-"));
  context.after(() => rm(dataDirectory, { recursive: true, force: true }));

  const store = new LibraryStore(dataDirectory);
  await store.initialize();
  const requests = [];
  const sync = new GitHubArticleSync({
    libraryStore: store,
    fetchImpl: async (url) => {
      requests.push(String(url));
      return createResponse({}, { status: 404 });
    }
  });

  assert.deepEqual(await sync.syncDate("2026-09-09"), {
    available: false,
    checked: true,
    imported: 0,
    updated: 0
  });
  assert.equal(requests.length, 1);
  assert.match(requests[0], /2026-09-09\.md/);
  await assert.rejects(() => sync.syncDate("09-09-2026"), /YYYY-MM-DD/);
});
