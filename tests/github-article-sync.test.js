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

test("imports date-named GitHub Markdown files into the default directory", async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "lovesuki-sync-"));
  context.after(() => rm(dataDirectory, { recursive: true, force: true }));

  const store = new LibraryStore(dataDirectory);
  await store.initialize();
  const requests = [];
  const sync = new GitHubArticleSync({
    libraryStore: store,
    refreshIntervalMs: 60_000,
    fetchImpl: async (url) => {
      requests.push(String(url));
      if (String(url).includes("/contents/")) {
        return createResponse([
          {
            type: "file",
            name: "2026-09-01.md",
            path: "daily-articles/2026-09-01.md",
            sha: "article-v1",
            download_url: "https://example.test/2026-09-01.md"
          },
          {
            type: "file",
            name: "notes.md",
            path: "daily-articles/notes.md",
            sha: "ignored",
            download_url: "https://example.test/notes.md"
          }
        ]);
      }
      return createResponse("# Why We Sleep\n\nSleep helps the brain learn.");
    }
  });

  const firstResult = await sync.sync();
  assert.deepEqual(firstResult, { checked: true, imported: 1, updated: 0 });
  const defaultDirectory = store.listLibrary().directories.find((item) => item.name === "默认目录");
  assert.equal(defaultDirectory.articles.length, 1);
  assert.equal(defaultDirectory.articles[0].title, "2026-09-01");
  const article = await store.getArticle(defaultDirectory.articles[0].id);
  assert.match(article.content, /Why We Sleep/);

  const cachedResult = await sync.sync();
  assert.deepEqual(cachedResult, { checked: false, imported: 0, updated: 0 });
  assert.equal(requests.length, 2);
});

test("updates an imported article when its GitHub revision changes", async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "lovesuki-sync-update-"));
  context.after(() => rm(dataDirectory, { recursive: true, force: true }));

  const store = new LibraryStore(dataDirectory);
  await store.initialize();
  let revision = "v1";
  const sync = new GitHubArticleSync({
    libraryStore: store,
    fetchImpl: async (url) => {
      if (String(url).includes("/contents/")) {
        return createResponse([{
          type: "file",
          name: "2026-09-01.md",
          path: "daily-articles/2026-09-01.md",
          sha: revision,
          download_url: "https://example.test/article.md"
        }]);
      }
      return createResponse(`# Article\n\nRevision ${revision}`);
    }
  });

  await sync.sync({ force: true });
  revision = "v2";
  const result = await sync.sync({ force: true });
  assert.deepEqual(result, { checked: true, imported: 0, updated: 1 });

  const articleMetadata = store.listLibrary().directories[0].articles[0];
  const article = await store.getArticle(articleMetadata.id);
  assert.match(article.content, /Revision v2/);
  assert.equal(store.listLibrary().directories[0].articles.length, 1);
});
