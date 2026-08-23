import { createFullscreenController } from "./modules/fullscreen.js";
import { Typewriter } from "./modules/typewriter.js";

const elements = {
  characterCount: document.querySelector("#characterCount"),
  clearButton: document.querySelector("#clearButton"),
  displayPanel: document.querySelector(".display-panel"),
  displaySurface: document.querySelector("#displaySurface"),
  editorMessage: document.querySelector("#editorMessage"),
  emptyState: document.querySelector("#emptyState"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  playIcon: document.querySelector("#playIcon path"),
  playbackButton: document.querySelector("#playbackButton"),
  playbackLabel: document.querySelector("#playbackLabel"),
  progressFill: document.querySelector("#progressFill"),
  progressPercent: document.querySelector("#progressPercent"),
  progressText: document.querySelector("#progressText"),
  renderedText: document.querySelector("#renderedText"),
  restartButton: document.querySelector("#restartButton"),
  speedOutput: document.querySelector("#speedOutput"),
  speedRange: document.querySelector("#speedRange"),
  startButton: document.querySelector("#startButton"),
  statusDot: document.querySelector("#statusDot"),
  statusText: document.querySelector("#statusText"),
  textInput: document.querySelector("#textInput")
};

const playPath = "M8 5.7v12.6a1 1 0 0 0 1.53.85l9.4-6.3a1 1 0 0 0 0-1.7l-9.4-6.3A1 1 0 0 0 8 5.7Z";
const pausePath = "M7 5h3v14H7V5Zm7 0h3v14h-3V5Z";

const typewriter = new Typewriter({
  target: elements.renderedText,
  getDelay: () => Number(elements.speedRange.value),
  onProgress: updateProgress,
  onStateChange: updatePlaybackState
});

createFullscreenController({
  element: elements.displayPanel,
  button: elements.fullscreenButton
});

function startFromInput() {
  const content = elements.textInput.value;
  if (!content.trim()) {
    elements.editorMessage.textContent = "先输入一些文字，再开始显示吧。";
    elements.textInput.focus();
    return;
  }

  elements.editorMessage.textContent = "";
  elements.emptyState.hidden = true;
  elements.renderedText.classList.add("is-visible");
  typewriter.load(content);
  typewriter.start();
}

function updatePlaybackState(state) {
  const states = {
    idle: { label: "暂停", status: "等待开始", playing: false, disabled: true },
    ready: { label: "继续", status: "准备显示", playing: false, disabled: false },
    playing: { label: "暂停", status: "正在显示", playing: true, disabled: false },
    paused: { label: "继续", status: "已暂停", playing: false, disabled: false },
    completed: { label: "再看一次", status: "显示完成", playing: false, disabled: false }
  };
  const current = states[state];

  elements.statusText.textContent = current.status;
  elements.statusDot.classList.toggle("is-playing", current.playing);
  elements.renderedText.classList.toggle("is-typing", current.playing);
  elements.playbackButton.disabled = current.disabled;
  elements.restartButton.disabled = state === "idle";
  elements.playbackLabel.textContent = current.label;
  elements.playIcon.setAttribute("d", current.playing ? pausePath : playPath);
}

function updateProgress({ current, total, ratio }) {
  const percent = Math.min(100, Math.round(ratio * 100));
  elements.progressText.textContent = `${formatNumber(current)} / ${formatNumber(total)}`;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressFill.style.width = `${percent}%`;

  if (current > 0 && current % 12 === 0) {
    elements.displaySurface.scrollTop = elements.displaySurface.scrollHeight;
  }
}

function updateCharacterCount() {
  // String length is intentionally O(1), so editing very large pasted text does
  // not trigger a full scan on every input event.
  const length = elements.textInput.value.length;
  elements.characterCount.textContent = `${formatNumber(length)} 字`;
}

function updateSpeed() {
  const value = Number(elements.speedRange.value);
  const minimum = Number(elements.speedRange.min);
  const maximum = Number(elements.speedRange.max);
  const percent = ((value - minimum) / (maximum - minimum)) * 100;
  elements.speedOutput.textContent = `${value} 毫秒 / 字`;
  elements.speedRange.style.setProperty("--range-progress", `${percent}%`);
}

function clearEverything() {
  elements.textInput.value = "";
  elements.emptyState.hidden = false;
  elements.renderedText.classList.remove("is-visible", "is-typing");
  elements.editorMessage.textContent = "";
  typewriter.clear();
  updateCharacterCount();
  elements.textInput.focus();
}

function togglePlayback() {
  if (typewriter.state === "playing") typewriter.pause();
  else if (typewriter.state === "completed") typewriter.restart();
  else typewriter.start();
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

elements.startButton.addEventListener("click", startFromInput);
elements.clearButton.addEventListener("click", clearEverything);
elements.playbackButton.addEventListener("click", togglePlayback);
elements.restartButton.addEventListener("click", () => typewriter.restart());
elements.speedRange.addEventListener("input", updateSpeed);
elements.textInput.addEventListener("input", updateCharacterCount);

document.addEventListener("keydown", (event) => {
  const isTyping = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
  if (event.code === "Space" && !isTyping && typewriter.state !== "idle") {
    event.preventDefault();
    togglePlayback();
  }
});

updateSpeed();
updateCharacterCount();
updatePlaybackState("idle");
