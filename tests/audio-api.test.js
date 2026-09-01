import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { createApiRouter } from "../backend/api/router.js";
import { LibraryStore } from "../backend/services/library-store.js";

class MockResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 0;
    this.headers = {};
    this.chunks = [];
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    this.headers = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)]));
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  get body() {
    return Buffer.concat(this.chunks);
  }
}

function createRequest({ method, url, headers = {}, body = Buffer.alloc(0) }) {
  const request = Readable.from(body.length ? [body] : []);
  request.method = method;
  request.url = url;
  request.headers = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  if (body.length && !request.headers["content-length"]) request.headers["content-length"] = String(body.length);
  return request;
}

test("uploads and range-streams article audio through the authenticated API", async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "lovesuki-audio-api-"));
  context.after(() => rm(dataDirectory, { recursive: true, force: true }));
  const libraryStore = new LibraryStore(dataDirectory);
  await libraryStore.initialize();
  const directory = libraryStore.listLibrary().directories[0];
  const article = await libraryStore.createArticle({ directoryId: directory.id, title: "音频文章", content: "正文" });
  const router = createApiRouter({
    libraryStore,
    authService: { isAuthenticated: () => true }
  });
  const payload = Buffer.from("mock-mp3-payload");

  const uploadResponse = new MockResponse();
  await router(createRequest({
    method: "PUT",
    url: `/api/articles/${article.id}/audio`,
    headers: {
      "Content-Type": "audio/mpeg",
      "X-Audio-File-Name": encodeURIComponent("文章朗读.mp3")
    },
    body: payload
  }), uploadResponse);
  if (!uploadResponse.writableFinished) await once(uploadResponse, "finish");
  assert.equal(uploadResponse.statusCode, 201);
  assert.equal(JSON.parse(uploadResponse.body).audio.originalName, "文章朗读.mp3");

  const streamResponse = new MockResponse();
  await router(createRequest({
    method: "GET",
    url: `/api/articles/${article.id}/audio`,
    headers: { Range: "bytes=5-9" }
  }), streamResponse);
  if (!streamResponse.writableFinished) await once(streamResponse, "finish");
  assert.equal(streamResponse.statusCode, 206);
  assert.equal(streamResponse.headers["accept-ranges"], "bytes");
  assert.equal(streamResponse.headers["content-range"], `bytes 5-9/${payload.length}`);
  assert.deepEqual(streamResponse.body, payload.subarray(5, 10));
});
