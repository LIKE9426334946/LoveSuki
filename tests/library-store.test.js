import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LibraryStore } from "../backend/services/library-store.js";

test("persists directories and Markdown articles across restarts", async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "lovesuki-store-"));
  context.after(() => rm(dataDirectory, { recursive: true, force: true }));

  const store = new LibraryStore(dataDirectory);
  await store.initialize();
  const directory = await store.createDirectory("想说的话");
  const content = "# 第一天\n\n**今天很好。**";
  const article = await store.createArticle({ directoryId: directory.id, title: "日记", content });

  const savedMarkdown = await readFile(path.join(dataDirectory, "articles", `${article.id}.md`), "utf8");
  assert.equal(savedMarkdown, content);

  const reloadedStore = new LibraryStore(dataDirectory);
  await reloadedStore.initialize();
  const reloadedArticle = await reloadedStore.getArticle(article.id);
  assert.equal(reloadedArticle.title, "日记");
  assert.equal(reloadedArticle.content, content);
  assert.equal(
    reloadedStore.listLibrary().directories.find((item) => item.id === directory.id).articles.length,
    1
  );
});

test("deleting a directory removes its article records and Markdown files", async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "lovesuki-delete-"));
  context.after(() => rm(dataDirectory, { recursive: true, force: true }));

  const store = new LibraryStore(dataDirectory);
  await store.initialize();
  const directory = await store.createDirectory("临时目录");
  const article = await store.createArticle({ directoryId: directory.id, title: "临时文章", content: "内容" });
  const result = await store.deleteDirectory(directory.id);

  assert.deepEqual(result.deletedArticleIds, [article.id]);
  assert.equal(store.listLibrary().directories.some((item) => item.id === directory.id), false);
  await assert.rejects(() => store.getArticle(article.id), /文章不存在/);
});
