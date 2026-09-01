import { TextCursor } from "./text-cursor.js";
import { DomTextCursor } from "./dom-text-cursor.js";

export class Typewriter {
  constructor({ target, getDelay, onProgress, onStateChange }) {
    this.target = target;
    this.getDelay = getDelay;
    this.onProgress = onProgress;
    this.onStateChange = onStateChange;
    this.cursor = new TextCursor("");
    this.textNode = document.createTextNode("");
    this.target.replaceChildren(this.textNode);
    this.mode = "text";
    this.state = "idle";
    this.frameId = null;
    this.lastTimestamp = null;
    this.accumulator = 0;
    this.lastAnchor = null;
  }

  load(text) {
    this.cancelFrame();
    this.cursor = new TextCursor(text);
    this.textNode = document.createTextNode("");
    this.target.replaceChildren(this.textNode);
    this.mode = "text";
    this.lastAnchor = null;
    this.resetTiming();
    this.setState("ready");
    this.emitProgress();
  }

  loadHtml(html) {
    this.cancelFrame();
    this.target.innerHTML = html;
    this.cursor = new DomTextCursor(this.target);
    this.textNode = null;
    this.mode = "html";
    this.lastAnchor = null;
    this.resetTiming();
    this.setState("ready");
    this.emitProgress();
  }

  resetTiming() {
    this.lastTimestamp = null;
    this.accumulator = 0;
  }

  start() {
    if (this.state === "playing") return;

    if (!this.cursor.total) {
      if (this.cursor.hasRenderableContent) {
        this.lastAnchor = this.cursor.finish?.() || null;
        this.emitProgress();
        this.setState("completed");
      }
      return;
    }

    if (this.state === "completed") this.restart();
    this.lastTimestamp = null;
    this.setState("playing");
    this.frameId = requestAnimationFrame((timestamp) => this.tick(timestamp));
  }

  pause() {
    if (this.state !== "playing") return;
    this.cancelFrame();
    this.setState("paused");
  }

  finish() {
    if (this.state === "idle" || this.state === "completed") return;
    this.cancelFrame();
    if (this.mode === "html") {
      this.cursor.finish?.();
    } else if (this.textNode) {
      this.textNode.nodeValue = this.cursor.finish?.() ?? this.cursor.text ?? "";
    }
    this.lastAnchor = null;
    this.resetTiming();
    this.emitProgress();
    this.setState("completed");
  }

  restart(autoplay = true) {
    this.cancelFrame();
    this.cursor.reset();
    if (this.textNode) this.textNode.nodeValue = "";
    this.lastAnchor = null;
    this.lastTimestamp = null;
    this.accumulator = 0;
    this.setState(autoplay ? "playing" : "ready");
    this.emitProgress();

    if (autoplay) {
      this.frameId = requestAnimationFrame((timestamp) => this.tick(timestamp));
    }
  }

  clear() {
    this.cancelFrame();
    this.cursor = new TextCursor("");
    this.textNode = document.createTextNode("");
    this.target.replaceChildren(this.textNode);
    this.mode = "text";
    this.lastAnchor = null;
    this.lastTimestamp = null;
    this.accumulator = 0;
    this.setState("idle");
    this.emitProgress();
  }

  tick(timestamp) {
    if (this.state !== "playing") return;

    if (this.lastTimestamp === null) this.lastTimestamp = timestamp;
    this.accumulator += timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    const delay = Math.max(1, Number(this.getDelay()) || 50);
    const charactersToWrite = Math.min(Math.floor(this.accumulator / delay), 120);

    if (charactersToWrite > 0) {
      let chunk = "";
      let writtenCharacters = 0;
      let activeNode = this.lastAnchor;
      for (let index = 0; index < charactersToWrite; index += 1) {
        const character = this.cursor.next();
        if (character.done) break;
        writtenCharacters += 1;
        if (character.anchor) activeNode = character.anchor;
        if (character.node) character.node.appendData(character.value);
        else chunk += character.value;
      }
      if (chunk && this.textNode) this.textNode.appendData(chunk);
      this.lastAnchor = activeNode;
      this.accumulator -= writtenCharacters * delay;
      this.emitProgress();
    }

    if (this.cursor.position >= this.cursor.total) {
      this.lastAnchor = this.cursor.finish?.() || this.lastAnchor;
      this.emitProgress();
      this.frameId = null;
      this.setState("completed");
      return;
    }

    this.frameId = requestAnimationFrame((nextTimestamp) => this.tick(nextTimestamp));
  }

  emitProgress() {
    this.onProgress?.({
      current: this.cursor.position,
      total: this.cursor.total,
      ratio: this.cursor.total ? this.cursor.position / this.cursor.total : 0,
      activeNode: this.lastAnchor
    });
  }

  setState(nextState) {
    this.state = nextState;
    this.onStateChange?.(nextState);
  }

  cancelFrame() {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }
}
