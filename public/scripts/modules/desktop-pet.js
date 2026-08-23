const FRAME_WIDTH = 129;
const DEFAULT_TOOLTIP = "拖动我 · 点我互动";

export const PET_ACTIONS = Object.freeze({
  idle: { label: "待机", rowY: 7, frames: 6, frameMs: 520, cycles: Infinity },
  runRight: { label: "向右跑", rowY: -135, frames: 8, frameMs: 105, cycles: 2, direction: 1 },
  runLeft: { label: "向左跑", rowY: -275, frames: 8, frameMs: 105, cycles: 2, direction: -1 },
  wave: { label: "挥手", rowY: -413, frames: 4, frameMs: 170, cycles: 2 },
  sit: { label: "坐下休息", rowY: -549, frames: 5, frameMs: 260, cycles: 2 },
  surprised: { label: "吓了一跳", rowY: -691, frames: 8, frameMs: 155, cycles: 1 },
  happy: { label: "开心", rowY: -833, frames: 6, frameMs: 210, cycles: 2 },
  curious: { label: "好奇", rowY: -971, frames: 6, frameMs: 220, cycles: 2 },
  shy: { label: "害羞", rowY: -1112, frames: 6, frameMs: 230, cycles: 2 },
  turnRight: { label: "向右看看", rowY: -1250, frames: 8, frameMs: 165, cycles: 1 },
  turnLeft: { label: "向左看看", rowY: -1389, frames: 8, frameMs: 165, cycles: 1 }
});

export const PET_INTERACTION_ACTIONS = Object.freeze([
  "wave", "happy", "surprised", "curious", "shy", "sit", "turnRight", "turnLeft"
]);

export const PET_AMBIENT_ACTIONS = Object.freeze([
  "sit", "happy", "curious", "shy", "turnRight", "turnLeft", "surprised", "run"
]);

export function getPetFramePosition(actionName, frameIndex) {
  const action = PET_ACTIONS[actionName];
  if (!action) throw new Error(`Unknown pet action: ${actionName}`);
  const frame = ((frameIndex % action.frames) + action.frames) % action.frames;
  return { x: frame === 0 ? 0 : -FRAME_WIDTH * frame, y: action.rowY };
}

function readPreferences(storageKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function createDesktopPet({
  element,
  toggleButton,
  boundary,
  storageKey = "lovesuki.viewer.pet"
}) {
  const sprite = element.querySelector(".pet-sprite");
  const tooltip = element.querySelector(".pet-tooltip");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const preferences = readPreferences(storageKey);

  let frameTimer = null;
  let behaviorTimer = null;
  let drag = null;
  let interactionIndex = 0;

  function savePreferences() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      // The pet remains usable when local storage is unavailable.
    }
  }

  function position(left, top) {
    const maximumLeft = Math.max(0, boundary.clientWidth - element.offsetWidth);
    const maximumTop = Math.max(0, boundary.clientHeight - element.offsetHeight);
    const nextLeft = Math.min(maximumLeft, Math.max(0, left));
    const nextTop = Math.min(maximumTop, Math.max(0, top));
    element.style.left = `${nextLeft}px`;
    element.style.top = `${nextTop}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
  }

  function restorePosition() {
    if (element.hidden) return;
    const maximumLeft = Math.max(0, boundary.clientWidth - element.offsetWidth);
    const maximumTop = Math.max(0, boundary.clientHeight - element.offsetHeight);
    const hasSavedPosition = Number.isFinite(preferences.x) && Number.isFinite(preferences.y);
    const left = hasSavedPosition ? preferences.x * maximumLeft : maximumLeft - 26;
    const top = hasSavedPosition ? preferences.y * maximumTop : maximumTop - 62;
    position(left, top);
  }

  function rememberPosition() {
    const maximumLeft = Math.max(1, boundary.clientWidth - element.offsetWidth);
    const maximumTop = Math.max(1, boundary.clientHeight - element.offsetHeight);
    preferences.x = Math.min(1, Math.max(0, element.offsetLeft / maximumLeft));
    preferences.y = Math.min(1, Math.max(0, element.offsetTop / maximumTop));
    savePreferences();
  }

  function renderFrame(actionName, frameIndex) {
    const { x, y } = getPetFramePosition(actionName, frameIndex);
    sprite.style.backgroundPosition = `${x}px ${y}px`;
  }

  function stopTimers() {
    window.clearInterval(frameTimer);
    window.clearTimeout(behaviorTimer);
    frameTimer = null;
    behaviorTimer = null;
  }

  function startIdle() {
    window.clearInterval(frameTimer);
    tooltip.textContent = DEFAULT_TOOLTIP;
    renderFrame("idle", 0);
    if (reducedMotion.matches) return;

    let frame = 0;
    frameTimer = window.setInterval(() => {
      frame = (frame + 1) % PET_ACTIONS.idle.frames;
      renderFrame("idle", frame);
    }, PET_ACTIONS.idle.frameMs);
  }

  function scheduleAmbientAction() {
    window.clearTimeout(behaviorTimer);
    if (element.hidden || reducedMotion.matches) return;
    behaviorTimer = window.setTimeout(() => {
      const selected = pickRandom(PET_AMBIENT_ACTIONS);
      playAction(selected === "run" ? chooseRunDirection() : selected);
    }, 4200 + Math.random() * 5200);
  }

  function completeAction(action, startLeft, travelDistance) {
    if (action.direction && travelDistance) {
      position(startLeft + travelDistance, element.offsetTop);
      rememberPosition();
    }
    startIdle();
    scheduleAmbientAction();
  }

  function playAction(actionName) {
    const action = PET_ACTIONS[actionName];
    if (!action || element.hidden) return;

    window.clearInterval(frameTimer);
    window.clearTimeout(behaviorTimer);
    tooltip.textContent = action.label;

    const startLeft = element.offsetLeft;
    const maximumLeft = Math.max(0, boundary.clientWidth - element.offsetWidth);
    const availableDistance = action.direction > 0 ? maximumLeft - startLeft : startLeft;
    const travelDistance = action.direction ? action.direction * Math.min(240, Math.max(0, availableDistance)) : 0;
    const totalFrames = action.frames * action.cycles;
    let frame = 0;
    renderFrame(actionName, frame);

    if (reducedMotion.matches) {
      renderFrame(actionName, action.frames - 1);
      frameTimer = window.setTimeout(() => completeAction(action, startLeft, travelDistance), 650);
      return;
    }

    frameTimer = window.setInterval(() => {
      frame += 1;
      if (frame >= totalFrames) {
        window.clearInterval(frameTimer);
        frameTimer = null;
        completeAction(action, startLeft, travelDistance);
        return;
      }

      renderFrame(actionName, frame);
      if (travelDistance) {
        position(startLeft + travelDistance * (frame / totalFrames), element.offsetTop);
      }
    }, action.frameMs);
  }

  function chooseRunDirection() {
    const maximumLeft = Math.max(1, boundary.clientWidth - element.offsetWidth);
    const positionRatio = element.offsetLeft / maximumLeft;
    if (positionRatio < 0.32) return "runRight";
    if (positionRatio > 0.68) return "runLeft";
    return Math.random() < 0.5 ? "runLeft" : "runRight";
  }

  function startBehavior() {
    stopTimers();
    startIdle();
    scheduleAmbientAction();
  }

  function interact() {
    const actionName = PET_INTERACTION_ACTIONS[interactionIndex % PET_INTERACTION_ACTIONS.length];
    interactionIndex += 1;
    playAction(actionName);
  }

  function setVisible(visible) {
    element.hidden = !visible;
    toggleButton.classList.toggle("is-active", visible);
    toggleButton.setAttribute("aria-pressed", String(visible));
    toggleButton.title = visible ? "隐藏桌宠" : "显示桌宠";
    preferences.hidden = !visible;
    savePreferences();

    if (visible) {
      requestAnimationFrame(() => {
        restorePosition();
        startBehavior();
      });
    } else {
      stopTimers();
    }
  }

  function beginDrag(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    stopTimers();
    renderFrame("idle", 0);
    tooltip.textContent = "拖动中";
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: element.offsetLeft,
      originTop: element.offsetTop,
      moved: false
    };
    element.setPointerCapture(event.pointerId);
    element.classList.add("is-dragging");
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.hypot(deltaX, deltaY) > 4) drag.moved = true;
    position(drag.originLeft + deltaX, drag.originTop + deltaY);
  }

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    drag = null;
    element.classList.remove("is-dragging");
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    rememberPosition();

    if (event.type === "pointercancel" || moved) startBehavior();
    else interact();
  }

  function handleKeydown(event) {
    if (event.key !== "Enter" && event.code !== "Space") return;
    event.preventDefault();
    event.stopPropagation();
    interact();
  }

  function toggleVisibility() {
    setVisible(element.hidden);
  }

  function handleViewportChange() {
    requestAnimationFrame(restorePosition);
  }

  element.addEventListener("pointerdown", beginDrag);
  element.addEventListener("pointermove", moveDrag);
  element.addEventListener("pointerup", endDrag);
  element.addEventListener("pointercancel", endDrag);
  element.addEventListener("keydown", handleKeydown);
  toggleButton.addEventListener("click", toggleVisibility);
  window.addEventListener("resize", handleViewportChange);
  document.addEventListener("fullscreenchange", handleViewportChange);

  setVisible(!preferences.hidden);

  return Object.freeze({ playAction, interact, setVisible });
}
