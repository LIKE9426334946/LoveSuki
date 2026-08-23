import test from "node:test";
import assert from "node:assert/strict";
import { DomTextCursor } from "../public/scripts/modules/dom-text-cursor.js";

function element(parentElement = null) {
  return { nodeType: 1, hidden: false, parentElement };
}

function textNode(value, parentElement) {
  return { nodeType: 3, nodeValue: value, parentElement };
}

function installDom(nodes) {
  const previousDocument = globalThis.document;
  const previousNodeFilter = globalThis.NodeFilter;
  globalThis.NodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
  globalThis.document = {
    createTreeWalker() {
      let index = 0;
      return { nextNode: () => nodes[index++] || null };
    }
  };
  return () => {
    globalThis.document = previousDocument;
    globalThis.NodeFilter = previousNodeFilter;
  };
}

test("reveals Markdown structure only when its text position is reached", () => {
  const heading = element();
  const headingText = textNode("标题", heading);
  const divider = element();
  const paragraph = element();
  const paragraphText = textNode("正文", paragraph);
  const restore = installDom([heading, headingText, divider, paragraph, paragraphText]);

  try {
    const cursor = new DomTextCursor({});
    assert.equal(heading.hidden, true);
    assert.equal(divider.hidden, true);
    assert.equal(paragraph.hidden, true);

    assert.equal(cursor.next().value, "标");
    assert.equal(heading.hidden, false);
    assert.equal(divider.hidden, true);

    assert.equal(cursor.next().value, "题");
    assert.equal(divider.hidden, true);

    assert.equal(cursor.next().value, "正");
    assert.equal(divider.hidden, false);
    assert.equal(paragraph.hidden, false);
  } finally {
    restore();
  }
});

test("restart hides revealed elements and finish reveals trailing elements", () => {
  const paragraph = element();
  const paragraphText = textNode("字", paragraph);
  const trailingDivider = element();
  const restore = installDom([paragraph, paragraphText, trailingDivider]);

  try {
    const cursor = new DomTextCursor({});
    cursor.next();
    cursor.finish();
    assert.equal(trailingDivider.hidden, false);

    cursor.reset();
    assert.equal(paragraph.hidden, true);
    assert.equal(trailingDivider.hidden, true);
    assert.equal(paragraphText.nodeValue, "");
  } finally {
    restore();
  }
});
