import test from "node:test";
import assert from "node:assert/strict";
import { createFullscreenController } from "../public/scripts/modules/fullscreen.js";

function createClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name)
  };
}

test("uses a page-level focus mode when native fullscreen is unavailable", async () => {
  const previousDocument = globalThis.document;
  const documentHandlers = {};
  const buttonHandlers = {};
  const bodyClassList = createClassList();
  const elementClassList = createClassList();
  const attributes = new Map();

  globalThis.document = {
    body: { classList: bodyClassList },
    fullscreenElement: null,
    addEventListener(type, handler) {
      documentHandlers[type] = handler;
    }
  };

  const element = { classList: elementClassList };
  const button = {
    title: "",
    addEventListener(type, handler) {
      buttonHandlers[type] = handler;
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    }
  };

  try {
    createFullscreenController({ element, button });
    await buttonHandlers.click();
    assert.equal(elementClassList.contains("is-focus-mode"), true);
    assert.equal(bodyClassList.contains("has-focus-mode"), true);
    assert.equal(attributes.get("aria-pressed"), "true");

    documentHandlers.keydown({ key: "Escape" });
    assert.equal(elementClassList.contains("is-focus-mode"), false);
    assert.equal(bodyClassList.contains("has-focus-mode"), false);
    assert.equal(attributes.get("aria-pressed"), "false");
  } finally {
    globalThis.document = previousDocument;
  }
});
