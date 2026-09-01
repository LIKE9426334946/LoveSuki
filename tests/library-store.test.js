import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
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
  await store.saveArticleAudio(article.id, {
    stream: Readable.from([Buffer.from("fake-mp3-audio")]),
    contentType: "audio/mpeg",
    originalName: "临时音频.mp3"
  });
  const audio = await store.getArticleAudio(article.id);
  const result = await store.deleteDirectory(directory.id);

  assert.deepEqual(result.deletedArticleIds, [article.id]);
  assert.equal(store.listLibrary().directories.some((item) => item.id === directory.id), false);
  await assert.rejects(() => store.getArticle(article.id), /文章不存在/);
  await assert.rejects(() => access(audio.filePath));
});

test("streams, replaces and deletes an article audio file", async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "lovesuki-audio-"));
  context.after(() => rm(dataDirectory, { recursive: true, force: true }));

  const store = new LibraryStore(dataDirectory);
  await store.initialize();
  const directory = store.listLibrary().directories[0];
  const article = await store.createArticle({ directoryId: directory.id, title: "有声文章", content: "正文" });
  const firstPayload = Buffer.from("first-audio-payload");
  const firstAudio = await store.saveArticleAudio(article.id, {
    stream: Readable.from([firstPayload]),
    contentType: "audio/mpeg",
    originalName: "lesson.mp3",
    declaredBytes: firstPayload.length
  });

  assert.equal(firstAudio.originalName, "lesson.mp3");
  assert.equal(firstAudio.contentType, "audio/mpeg");
  assert.equal(firstAudio.size, firstPayload.length);
  const firstFile = await store.getArticleAudio(article.id);
  assert.deepEqual(await readFile(firstFile.filePath), firstPayload);

  const reloadedStore = new LibraryStore(dataDirectory);
  await reloadedStore.initialize();
  assert.equal((await reloadedStore.getArticle(article.id)).audio.originalName, "lesson.mp3");

  const secondPayload = Buffer.from("replacement-audio");
  await reloadedStore.saveArticleAudio(article.id, {
    stream: Readable.from([secondPayload]),
    contentType: "audio/mp4",
    originalName: "lesson.m4a"
  });
  await assert.rejects(() => access(firstFile.filePath));
  assert.deepEqual(await readFile((await reloadedStore.getArticleAudio(article.id)).filePath), secondPayload);

  await reloadedStore.deleteArticleAudio(article.id);
  assert.equal((await reloadedStore.getArticle(article.id)).audio, undefined);
  await assert.rejects(() => reloadedStore.getArticleAudio(article.id), /还没有音频/);
});
