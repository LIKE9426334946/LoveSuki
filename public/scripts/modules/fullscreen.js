export function createFullscreenController({ element, button }) {
  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await element.requestFullscreen();
    } catch {
      button.title = "当前浏览器无法进入专注显示";
    }
  }

  function sync() {
    const active = document.fullscreenElement === element;
    button.setAttribute("aria-label", active ? "退出专注显示" : "进入专注显示");
    button.title = active ? "退出专注显示" : "专注显示";
  }

  button.addEventListener("click", toggle);
  document.addEventListener("fullscreenchange", sync);

  return { toggle };
}
