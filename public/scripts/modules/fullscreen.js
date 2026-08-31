export function createFullscreenController({ element, button }) {
  function isFallbackActive() {
    return element.classList.contains("is-focus-mode");
  }

  function enterFallback() {
    element.classList.add("is-focus-mode");
    document.body.classList.add("has-focus-mode");
  }

  function exitFallback() {
    element.classList.remove("is-focus-mode");
    document.body.classList.remove("has-focus-mode");
  }

  async function toggle() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (isFallbackActive()) {
      exitFallback();
      sync();
      return;
    }

    if (typeof element.requestFullscreen === "function") {
      try {
        await element.requestFullscreen({ navigationUI: "hide" });
        return;
      } catch {
        // iOS Safari and some embedded browsers do not expose element fullscreen.
      }
    }

    enterFallback();
    sync();
  }

  function sync() {
    const active = document.fullscreenElement === element || isFallbackActive();
    button.setAttribute("aria-label", active ? "退出专注显示" : "进入专注显示");
    button.title = active ? "退出专注显示" : "专注显示";
    button.setAttribute("aria-pressed", String(active));
  }

  function handleKeydown(event) {
    if (event.key !== "Escape" || !isFallbackActive()) return;
    exitFallback();
    sync();
  }

  button.addEventListener("click", toggle);
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("keydown", handleKeydown);
  sync();

  return { toggle, exit: exitFallback };
}
