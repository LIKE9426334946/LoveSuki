import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../backend/services/markdown-renderer.js";

test("renders common Markdown structures", () => {
  const html = renderMarkdown("# 标题\n\n**加粗**\n\n- 第一项\n- 第二项");
  assert.match(html, /<h1>标题<\/h1>/);
  assert.match(html, /<strong>加粗<\/strong>/);
  assert.match(html, /<ul>/);
});

test("does not execute raw HTML or unsafe links", () => {
  const html = renderMarkdown('<script>alert("x")</script>\n\n[危险链接](javascript:alert(1))');
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /&lt;script&gt;/);
});
