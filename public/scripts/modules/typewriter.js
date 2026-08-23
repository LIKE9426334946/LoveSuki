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
  }

  load(text) {
    this.cancelFrame();
    this.cursor = new TextCursor(text);
    this.textNode = document.createTextNode("");
    this.target.replaceChildren(this.textNode);
    this.mode = "text";
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
    this.resetTiming();
    this.setState("ready");
    this.emitProgress();
  }

  resetTiming() {
    this.lastTimestamp = null;
    this.accumulator = 0;
  }

  start() {
    if (!this.cursor.total || this.state === "playing") return;

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

  restart(autoplay = true) {
    this.cancelFrame();
    this.cursor.reset();
    if (this.textNode) this.textNode.nodeValue = "";
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
      for (let index = 0; index < charactersToWrite; index += 1) {
        const character = this.cursor.next();
        if (character.done) break;
        writtenCharacters += 1;
        if (character.node) character.node.appendData(character.value);
        else chunk += character.value;
      }
      if (chunk && this.textNode) this.textNode.appendData(chunk);
      this.accumulator -= writtenCharacters * delay;
      this.emitProgress();
    }

    if (this.cursor.position >= this.cursor.total) {
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
      ratio: this.cursor.total ? this.cursor.position / this.cursor.total : 0
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
