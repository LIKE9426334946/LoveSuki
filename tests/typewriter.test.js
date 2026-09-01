import test from "node:test";
import assert from "node:assert/strict";
import { Typewriter } from "../public/scripts/modules/typewriter.js";

test("finish immediately renders all remaining plain text", () => {
  const previousDocument = globalThis.document;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  globalThis.document = {
    createTextNode(value) {
      return {
        nodeValue: value,
        appendData(chunk) { this.nodeValue += chunk; }
      };
    }
  };
  globalThis.cancelAnimationFrame = () => undefined;
  const target = {
    replaceChildren(node) { this.child = node; }
  };
  const states = [];
  const progress = [];

  try {
    const typewriter = new Typewriter({
      target,
      getDelay: () => 50,
      onStateChange: (state) => states.push(state),
      onProgress: (value) => progress.push(value)
    });
    typewriter.load("立即显示全部内容");
    typewriter.finish();

    assert.equal(target.child.nodeValue, "立即显示全部内容");
    assert.equal(typewriter.state, "completed");
    assert.equal(progress.at(-1).ratio, 1);
    assert.deepEqual(states.slice(-2), ["ready", "completed"]);
  } finally {
    globalThis.document = previousDocument;
    globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
  }
});
