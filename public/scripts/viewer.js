import { createFullscreenController } from "./modules/fullscreen.js";
import { handleUnauthorized, setupLogout } from "./modules/auth.js";
import { Typewriter } from "./modules/typewriter.js";

const elements = Object.fromEntries([
  "articleAudio", "articleAudioPanel", "audioPlaybackButton", "audioPlayIcon", "audioProgress", "audioTime", "audioTitle",
  "directoryList", "emptyState", "emptyStateHint", "emptyStateMessage", "fullscreenButton",
  "libraryEmpty", "libraryLoading", "playbackButton", "playbackLabel", "playIcon", "progressFill",
  "progressPercent", "progressText", "renderedText", "restartButton", "speedOutput", "speedRange",
  "libraryBackdrop", "logoutButton", "mobileLibraryButton", "mobileLibraryCloseButton", "settingsButton",
  "settingsCloseButton", "showAllButton", "viewerLibraryPanel", "viewerSettingsPanel", "statusDot", "statusText", "viewerArticleTitle"
].map((id) => [id, document.querySelector(`#${id}`)]));

elements.displayPanel = document.querySelector(".display-panel");
elements.displaySurface = document.querySelector("#displaySurface");

const state = {
  library: { directories: [] },
  currentArticleId: null,
  selectedDirectoryId: null,
  openDirectoryIds: new Set(),
  articleRequest: 0
};

const playPath = "M8 5.7v12.6a1 1 0 0 0 1.53.85l9.4-6.3a1 1 0 0 0 0-1.7l-9.4-6.3A1 1 0 0 0 8 5.7Z";
const pausePath = "M7 5h3v14H7V5Zm7 0h3v14h-3V5Z";
const folderPath = "M3 5.5A1.5 1.5 0 0 1 4.5 4h5l2 2h8A1.5 1.5 0 0 1 21 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-12Z";
const chevronPath = "m9 5 7 7-7 7V5Z";

const typewriter = new Typewriter({
  target: elements.renderedText,
  getDelay: () => Number(elements.speedRange.value),
  onProgress: updateProgress,
  onStateChange: updatePlaybackState
});

createFullscreenController({ element: elements.displayPanel, button: elements.fullscreenButton });

const mobileViewport = window.matchMedia("(max-width: 720px)");

function setLibraryOpen(open, { restoreFocus = false } = {}) {
  if (open) setSettingsOpen(false);
  const isMobile = mobileViewport.matches;
  const shouldOpen = Boolean(open && isMobile);
  document.body.classList.toggle("library-open", shouldOpen);
  elements.mobileLibraryButton.setAttribute("aria-expanded", String(shouldOpen));
  elements.viewerLibraryPanel.inert = Boolean(isMobile && !shouldOpen);
  if (isMobile) elements.viewerLibraryPanel.setAttribute("aria-hidden", String(!shouldOpen));
  else elements.viewerLibraryPanel.removeAttribute("aria-hidden");

  if (shouldOpen) {
    requestAnimationFrame(() => elements.mobileLibraryCloseButton.focus());
  } else if (restoreFocus && isMobile) {
    elements.mobileLibraryButton.focus();
  }
}

function setSettingsOpen(open, { restoreFocus = false } = {}) {
  const isMobile = mobileViewport.matches;
  const shouldOpen = Boolean(open && isMobile);
  elements.displayPanel.classList.toggle("settings-open", shouldOpen);
  elements.settingsButton.setAttribute("aria-expanded", String(shouldOpen));
  if (isMobile) elements.viewerSettingsPanel.setAttribute("aria-hidden", String(!shouldOpen));
  else elements.viewerSettingsPanel.removeAttribute("aria-hidden");
  if (!shouldOpen && restoreFocus && isMobile) elements.settingsButton.focus();
}

async function api(path, options = {}) {
  const requestOptions = { ...options, headers: { ...(options.headers || {}) } };
  if (options.body) requestOptions.headers["Content-Type"] = "application/json";

  const response = await fetch(path, requestOptions);
  const data = await response.json().catch(() => ({}));
  if (handleUnauthorized(response)) throw new Error("登录状态已失效。");
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

async function initialize() {
  try {
    const data = await api("/api/library");
    state.library = data;
    elements.libraryLoading.hidden = true;
    elements.directoryList.hidden = data.directories.length === 0;
    elements.libraryEmpty.hidden = data.directories.length > 0;

    const firstDirectoryWithArticle = data.directories.find((directory) => directory.articles.length > 0);
    if (!firstDirectoryWithArticle) {
      renderLibrary();
      showEmptyState("还没有可显示的文章", "请前往管理页面创建文章");
      return;
    }

    state.selectedDirectoryId = firstDirectoryWithArticle.id;
    state.openDirectoryIds.add(firstDirectoryWithArticle.id);
    renderLibrary();
    await selectArticle(firstDirectoryWithArticle.articles[0].id);
  } catch (error) {
    elements.libraryLoading.textContent = `无法读取文章库：${error.message}`;
    showEmptyState("文章库连接失败", "请稍后刷新页面重试");
  }
}

function renderLibrary() {
  elements.directoryList.replaceChildren();

  for (const directory of state.library.directories) {
    const card = document.createElement("section");
    const isOpen = state.openDirectoryIds.has(directory.id);
    const isActive = state.selectedDirectoryId === directory.id;
    card.className = `directory-card${isOpen ? " is-open" : ""}${isActive ? " is-active" : ""}`;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "directory-toggle";
    toggle.innerHTML = `<svg class="directory-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="${folderPath}" /></svg><span class="directory-title-wrap"><span class="directory-name"></span><span class="directory-count"></span></span><svg class="directory-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="${chevronPath}" /></svg>`;
    toggle.querySelector(".directory-name").textContent = directory.name;
    toggle.querySelector(".directory-count").textContent = `${directory.articles.length} 篇文章`;
    toggle.addEventListener("click", () => {
      state.selectedDirectoryId = directory.id;
      if (state.openDirectoryIds.has(directory.id)) state.openDirectoryIds.delete(directory.id);
      else state.openDirectoryIds.add(directory.id);
      renderLibrary();
    });

    const header = document.createElement("div");
    header.className = "directory-header";
    header.append(toggle);
    card.append(header);

    if (isOpen) {
      const articleList = document.createElement("div");
      articleList.className = "article-list";

      for (const article of directory.articles) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `article-button${state.currentArticleId === article.id ? " is-active" : ""}`;
        button.innerHTML = '<span class="article-dot" aria-hidden="true"></span><span class="article-title-text"></span>';
        button.querySelector(".article-title-text").textContent = article.title;
        button.addEventListener("click", () => {
          setLibraryOpen(false, { restoreFocus: true });
          selectArticle(article.id);
        });

        const row = document.createElement("div");
        row.className = "article-item";
        row.append(button);
        articleList.append(row);
      }
      card.append(articleList);
    }

    elements.directoryList.append(card);
  }
}

async function selectArticle(articleId) {
  if (state.currentArticleId === articleId) return;
  const requestId = ++state.articleRequest;
  state.currentArticleId = articleId;
  configureArticleAudio(null);
  renderLibrary();
  showEmptyState("正在读取文章", "Markdown 内容加载中");
  elements.viewerArticleTitle.textContent = "正在读取…";
  elements.statusText.textContent = "正在读取";

  try {
    const { article } = await api(`/api/articles/${encodeURIComponent(articleId)}`);
    if (requestId !== state.articleRequest) return;

    state.selectedDirectoryId = article.directoryId;
    state.openDirectoryIds.add(article.directoryId);
    elements.viewerArticleTitle.textContent = article.title;
    configureArticleAudio(article);
    renderLibrary();

    if (!article.content.trim()) {
      showEmptyState("这篇文章还没有内容", "请在管理页面中编辑并保存");
      elements.statusText.textContent = "文章为空";
      return;
    }

    const { html } = await api("/api/markdown/render", {
      method: "POST",
      body: JSON.stringify({ content: article.content })
    });
    if (requestId !== state.articleRequest) return;

    elements.emptyState.hidden = true;
    elements.renderedText.classList.add("is-visible");
    typewriter.loadHtml(html);
  } catch (error) {
    if (requestId !== state.articleRequest) return;
    showEmptyState("文章读取失败", error.message);
    elements.statusText.textContent = "读取失败";
  }
}

function formatAudioTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function configureArticleAudio(article) {
  elements.articleAudio.pause();
  elements.articleAudioPanel.hidden = !article?.audio;
  elements.audioProgress.value = "0";
  elements.audioProgress.style.setProperty("--range-progress", "0%");
  elements.audioTime.textContent = "0:00 / 0:00";
  elements.audioPlayIcon.setAttribute("d", playPath);
  elements.audioPlaybackButton.setAttribute("aria-label", "播放文章音频");

  if (!article?.audio) {
    elements.articleAudio.removeAttribute("src");
    elements.articleAudio.load();
    return;
  }

  elements.audioTitle.textContent = article.audio.originalName || "文章音频";
  elements.articleAudio.src = `/api/articles/${encodeURIComponent(article.id)}/audio?v=${encodeURIComponent(article.audio.updatedAt)}`;
  elements.articleAudio.load();
}

function updateAudioProgress() {
  const duration = elements.articleAudio.duration;
  const currentTime = elements.articleAudio.currentTime;
  const ratio = Number.isFinite(duration) && duration > 0 ? currentTime / duration : 0;
  const progress = Math.min(1000, Math.round(ratio * 1000));
  elements.audioProgress.value = String(progress);
  elements.audioProgress.style.setProperty("--range-progress", `${ratio * 100}%`);
  elements.audioTime.textContent = `${formatAudioTime(currentTime)} / ${formatAudioTime(duration)}`;
}

function updateAudioPlaybackButton() {
  const playing = !elements.articleAudio.paused && !elements.articleAudio.ended;
  elements.audioPlayIcon.setAttribute("d", playing ? pausePath : playPath);
  elements.audioPlaybackButton.setAttribute("aria-label", playing ? "暂停文章音频" : "播放文章音频");
}

async function toggleArticleAudio() {
  if (elements.articleAudio.paused || elements.articleAudio.ended) {
    try {
      await elements.articleAudio.play();
    } catch {
      elements.audioTitle.textContent = "音频无法播放";
    }
  } else {
    elements.articleAudio.pause();
  }
}

function showEmptyState(message, hint) {
  typewriter.clear();
  elements.renderedText.classList.remove("is-visible");
  elements.emptyState.hidden = false;
  elements.emptyStateMessage.textContent = message;
  elements.emptyStateHint.textContent = hint;
}

function updatePlaybackState(playbackState) {
  const states = {
    idle: { label: "开始", status: "等待选择", playing: false, disabled: true },
    ready: { label: "开始", status: "准备显示", playing: false, disabled: false },
    playing: { label: "暂停", status: "正在显示", playing: true, disabled: false },
    paused: { label: "继续", status: "已暂停", playing: false, disabled: false },
    completed: { label: "再看一次", status: "显示完成", playing: false, disabled: false }
  };
  const current = states[playbackState];
  elements.displaySurface.dataset.playbackState = playbackState;
  elements.statusText.textContent = current.status;
  elements.statusDot.classList.toggle("is-playing", current.playing);
  elements.playbackButton.disabled = current.disabled;
  elements.restartButton.disabled = playbackState === "idle";
  elements.showAllButton.disabled = playbackState === "idle" || playbackState === "completed";
  elements.playbackLabel.textContent = current.label;
  elements.playIcon.setAttribute("d", current.playing ? pausePath : playPath);
}

function updateProgress({ current, total, ratio, activeNode }) {
  const percent = Math.min(100, Math.round(ratio * 100));
  elements.progressText.textContent = `${new Intl.NumberFormat("zh-CN").format(current)} / ${new Intl.NumberFormat("zh-CN").format(total)}`;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressFill.style.width = `${percent}%`;

  if (current === 0) {
    elements.displaySurface.scrollTop = 0;
    return;
  }
  keepActiveTextVisible(activeNode);
}

function keepActiveTextVisible(activeNode) {
  const anchorElement = activeNode?.nodeType === Node.ELEMENT_NODE ? activeNode : activeNode?.parentElement;
  if (!anchorElement || !elements.displaySurface.contains(anchorElement)) return;

  const surfaceRect = elements.displaySurface.getBoundingClientRect();
  const anchorRect = anchorElement.getBoundingClientRect();
  const upperBoundary = surfaceRect.top + Math.min(40, surfaceRect.height * 0.08);
  const lowerBoundary = surfaceRect.bottom - Math.min(72, surfaceRect.height * 0.18);

  if (anchorRect.bottom > lowerBoundary) {
    elements.displaySurface.scrollTop += anchorRect.bottom - lowerBoundary;
  } else if (anchorRect.top < upperBoundary) {
    elements.displaySurface.scrollTop -= upperBoundary - anchorRect.top;
  }
}

function togglePlayback() {
  if (typewriter.state === "playing") typewriter.pause();
  else if (typewriter.state === "completed") typewriter.restart();
  else typewriter.start();
}

function updateSpeed() {
  const value = Number(elements.speedRange.value);
  const minimum = Number(elements.speedRange.min);
  const maximum = Number(elements.speedRange.max);
  const percent = ((value - minimum) / (maximum - minimum)) * 100;
  elements.speedOutput.textContent = `${value} ms`;
  elements.speedRange.style.setProperty("--range-progress", `${percent}%`);
}

elements.playbackButton.addEventListener("click", togglePlayback);
elements.showAllButton.addEventListener("click", () => typewriter.finish());
elements.audioPlaybackButton.addEventListener("click", toggleArticleAudio);
elements.audioProgress.addEventListener("input", () => {
  const duration = elements.articleAudio.duration;
  if (Number.isFinite(duration) && duration > 0) {
    elements.articleAudio.currentTime = (Number(elements.audioProgress.value) / 1000) * duration;
    updateAudioProgress();
  }
});
elements.articleAudio.addEventListener("loadedmetadata", updateAudioProgress);
elements.articleAudio.addEventListener("durationchange", updateAudioProgress);
elements.articleAudio.addEventListener("timeupdate", updateAudioProgress);
elements.articleAudio.addEventListener("play", updateAudioPlaybackButton);
elements.articleAudio.addEventListener("pause", updateAudioPlaybackButton);
elements.articleAudio.addEventListener("ended", updateAudioPlaybackButton);
elements.articleAudio.addEventListener("error", () => {
  if (elements.articleAudio.getAttribute("src")) elements.audioTitle.textContent = "音频加载失败";
});
elements.restartButton.addEventListener("click", () => typewriter.restart());
elements.speedRange.addEventListener("input", updateSpeed);
elements.mobileLibraryButton.addEventListener("click", () => setLibraryOpen(true));
elements.mobileLibraryCloseButton.addEventListener("click", () => setLibraryOpen(false, { restoreFocus: true }));
elements.libraryBackdrop.addEventListener("click", () => setLibraryOpen(false, { restoreFocus: true }));
elements.settingsButton.addEventListener("click", () => {
  setSettingsOpen(!elements.displayPanel.classList.contains("settings-open"));
});
elements.settingsCloseButton.addEventListener("click", () => setSettingsOpen(false, { restoreFocus: true }));
document.addEventListener("pointerdown", (event) => {
  if (
    elements.displayPanel.classList.contains("settings-open")
    && !elements.viewerSettingsPanel.contains(event.target)
    && !elements.settingsButton.contains(event.target)
  ) {
    setSettingsOpen(false);
  }
});
const handleViewportModeChange = () => {
  setLibraryOpen(false);
  setSettingsOpen(false);
};
if (typeof mobileViewport.addEventListener === "function") mobileViewport.addEventListener("change", handleViewportModeChange);
else mobileViewport.addListener?.(handleViewportModeChange);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.body.classList.contains("library-open")) {
    setLibraryOpen(false, { restoreFocus: true });
    return;
  }
  if (event.key === "Escape" && elements.displayPanel.classList.contains("settings-open")) {
    setSettingsOpen(false, { restoreFocus: true });
    return;
  }
  const isInteractive = event.target.closest?.("button, input, select, textarea, a, audio");
  if (event.code === "Space" && !isInteractive && typewriter.state !== "idle") {
    event.preventDefault();
    togglePlayback();
  }
});

updateSpeed();
updatePlaybackState("idle");
setLibraryOpen(false);
setSettingsOpen(false);
setupLogout(elements.logoutButton);
initialize();
