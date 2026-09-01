import test from "node:test";
import assert from "node:assert/strict";
import { TextCursor, countGraphemes } from "../public/scripts/modules/text-cursor.js";

test("counts Chinese characters and punctuation", () => {
  const text = "你好，Suki！";
  assert.equal(countGraphemes(text, new Intl.Segmenter("zh-CN", { granularity: "grapheme" })), 8);
});

test("treats a composed emoji as one visible character", () => {
  const text = "A👨‍👩‍👧‍👦B";
  const cursor = new TextCursor(text);
  assert.equal(cursor.total, text.length);
  assert.deepEqual(cursor.next(), { done: false, value: "A" });
  assert.deepEqual(cursor.next(), { done: false, value: "👨‍👩‍👧‍👦" });
  assert.deepEqual(cursor.next(), { done: false, value: "B" });
  assert.deepEqual(cursor.next(), { done: true, value: "" });
});

test("reset reuses the same source without allocating a character array", () => {
  const cursor = new TextCursor("爱你");
  cursor.next();
  cursor.reset();
  assert.equal(cursor.position, 0);
  assert.deepEqual(cursor.next(), { done: false, value: "爱" });
});

test("finish exposes the complete source immediately", () => {
  const cursor = new TextCursor("立即显示全部");
  cursor.next();
  assert.equal(cursor.finish(), "立即显示全部");
  assert.equal(cursor.position, cursor.total);
  assert.equal(cursor.next().done, true);
});

test("constructing a long cursor uses the source length without a full count", () => {
  const text = "字".repeat(5_000_000);
  const cursor = new TextCursor(text);
  assert.equal(cursor.total, 5_000_000);
  assert.deepEqual(cursor.next(), { done: false, value: "字" });
});
