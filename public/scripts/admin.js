import { handleUnauthorized, setupLogout } from "./modules/auth.js";

const elements = Object.fromEntries([
  "adminAudioPreview", "adminAudioState", "articleDialog", "articleDialogMessage", "articleDirectory",
  "articleForm", "articleTitle", "audioFileInput", "characterCount", "deleteArticleButton", "deleteAudioButton", "directoryDialog", "directoryDialogMessage",
  "directoryDialogMode", "directoryDialogTitle", "directoryForm", "directoryList", "directoryName",
  "editingDirectoryId", "editorContent", "editorEmpty", "editorMessage", "emptyNewDirectoryButton",
  "libraryEmpty", "libraryLoading", "newArticleDirectory", "newArticleTitle", "newDirectoryButton",
  "logoutButton", "saveButton", "saveState", "selectAudioButton", "textInput"
].map((id) => [id, document.querySelector(`#${id}`)]));

const state = {
  library: { directories: [] },
  selectedDirectoryId: null,
  currentArticle: null,
  dirty: false,
  saving: false,
  audioBusy: false,
  articleRequest: 0,
  openDirectoryIds: new Set()
};

const folderPath = "M3 5.5A1.5 1.5 0 0 1 4.5 4h5l2 2h8A1.5 1.5 0 0 1 21 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-12Z";
const chevronPath = "m9 5 7 7-7 7V5Z";
const editPath = "m5 16.6-.8 3.2 3.2-.8L18 8.4 15.6 6 5 16.6ZM17 4.6l2.4 2.4.8-.8a1.7 1.7 0 0 0 0-2.4 1.7 1.7 0 0 0-2.4 0l-.8.8Z";
const trashPath = "M7 6V4h3l1-1h2l1 1h3v2H7Zm1 2h8l-.6 12H8.6L8 8Zm2 2 .3 8h1L11 10h-1Zm3 0-.3 8h1l.3-8h-1Z";

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
    await refreshLibrary();
    const firstDirectory = state.library.directories[0];
    if (!firstDirectory) return;

    state.selectedDirectoryId = firstDirectory.id;
    state.openDirectoryIds.add(firstDirectory.id);
    renderLibrary();
    if (firstDirectory.articles[0]) {
      await selectArticle(firstDirectory.articles[0].id, { skipGuard: true });
    }
  } catch (error) {
    elements.libraryLoading.textContent = `无法读取文章库：${error.message}`;
  }
}

async function refreshLibrary() {
  const data = await api("/api/library");
  state.library = data;
  elements.libraryLoading.hidden = true;
  elements.directoryList.hidden = data.directories.length === 0;
  elements.libraryEmpty.hidden = data.directories.length > 0;
  updateDirectorySelects();
  renderLibrary();
}

function renderLibrary() {
  elements.directoryList.replaceChildren();

  for (const directory of state.library.directories) {
    const card = document.createElement("section");
    const isOpen = state.openDirectoryIds.has(directory.id);
    const isActive = state.selectedDirectoryId === directory.id;
    card.className = `directory-card${isOpen ? " is-open" : ""}${isActive ? " is-active" : ""}`;

    const header = document.createElement("div");
    header.className = "directory-header";

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

    const actions = document.createElement("div");
    actions.className = "directory-actions";
    actions.append(
      createMiniButton("重命名目录", editPath, () => openRenameDirectoryDialog(directory)),
      createMiniButton("删除目录", trashPath, () => deleteDirectory(directory), true)
    );

    header.append(toggle, actions);
    card.append(header);

    if (isOpen) {
      const articleList = document.createElement("div");
      articleList.className = "article-list";

      for (const article of directory.articles) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `article-button${state.currentArticle?.id === article.id ? " is-active" : ""}`;
        button.innerHTML = '<span class="article-dot" aria-hidden="true"></span><span class="article-title-text"></span>';
        button.querySelector(".article-title-text").textContent = article.title;
        button.addEventListener("click", () => selectArticle(article.id));

        const row = document.createElement("div");
        row.className = "article-item";
        row.append(button);
        articleList.append(row);
      }

      const createButton = document.createElement("button");
      createButton.type = "button";
      createButton.className = "new-article-button";
      createButton.textContent = "+ 新建文章";
      createButton.addEventListener("click", () => openArticleDialog(directory.id));
      articleList.append(createButton);
      card.append(articleList);
    }

    elements.directoryList.append(card);
  }
}

function createMiniButton(label, iconPath, handler, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `mini-icon-button${danger ? " danger" : ""}`;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${iconPath}" /></svg>`;
  button.addEventListener("click", handler);
  return button;
}

async function selectArticle(articleId, { skipGuard = false } = {}) {
  if (state.currentArticle?.id === articleId) return;
  if (state.audioBusy) {
    showEditorMessage("请等待音频操作完成。");
    return;
  }
  if (!skipGuard && !canDiscardChanges()) return;

  const requestId = ++state.articleRequest;
  setSaveState("正在读取…", "saving");
  try {
    const { article } = await api(`/api/articles/${encodeURIComponent(articleId)}`);
    if (requestId !== state.articleRequest) return;

    state.currentArticle = article;
    state.selectedDirectoryId = article.directoryId;
    state.openDirectoryIds.add(article.directoryId);
    state.dirty = false;
    populateEditor(article);
    renderLibrary();
  } catch (error) {
    showEditorMessage(error.message);
    setSaveState("读取失败", "dirty");
  }
}

function populateEditor(article) {
  elements.editorEmpty.hidden = true;
  elements.editorContent.hidden = false;
  elements.articleTitle.value = article.title;
  elements.articleDirectory.value = article.directoryId;
  elements.textInput.value = article.content;
  renderArticleAudio(article);
  updateCharacterCount();
  setSaveState("已保存");
  showEditorMessage("");
}

function clearEditor() {
  state.currentArticle = null;
  state.dirty = false;
  elements.editorContent.hidden = true;
  elements.editorEmpty.hidden = false;
  elements.articleTitle.value = "";
  elements.textInput.value = "";
  renderArticleAudio(null);
  renderLibrary();
}

function markDirty() {
  if (!state.currentArticle || state.saving) return;
  state.dirty = true;
  setSaveState("有未保存修改", "dirty");
  updateCharacterCount();
}

async function saveArticle() {
  if (!state.currentArticle || state.saving) return false;
  const title = elements.articleTitle.value.trim();
  if (!title) {
    showEditorMessage("文章标题不能为空。");
    elements.articleTitle.focus();
    return false;
  }

  state.saving = true;
  elements.saveButton.disabled = true;
  setSaveState("正在保存…", "saving");
  showEditorMessage("");

  try {
    const { article } = await api(`/api/articles/${encodeURIComponent(state.currentArticle.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        directoryId: elements.articleDirectory.value,
        title,
        content: elements.textInput.value
      })
    });
    state.currentArticle = article;
    state.selectedDirectoryId = article.directoryId;
    state.openDirectoryIds.add(article.directoryId);
    state.dirty = false;
    setSaveState("已保存");
    await refreshLibrary();
    return true;
  } catch (error) {
    showEditorMessage(error.message);
    setSaveState("保存失败", "dirty");
    return false;
  } finally {
    state.saving = false;
    elements.saveButton.disabled = false;
  }
}

async function deleteArticle() {
  if (!state.currentArticle || state.audioBusy) return;
  if (!window.confirm(`确定删除文章“${state.currentArticle.title}”吗？删除后无法恢复。`)) return;

  try {
    await api(`/api/articles/${encodeURIComponent(state.currentArticle.id)}`, { method: "DELETE" });
    clearEditor();
    await refreshLibrary();
  } catch (error) {
    showEditorMessage(error.message);
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderArticleAudio(article) {
  const audio = article?.audio;
  elements.audioFileInput.value = "";
  elements.selectAudioButton.textContent = audio ? "替换音频" : "上传音频";
  elements.deleteAudioButton.hidden = !audio;
  elements.adminAudioState.textContent = audio
    ? `${audio.originalName} · ${formatFileSize(audio.size)}`
    : "未上传音频";

  elements.adminAudioPreview.pause();
  if (audio && article) {
    elements.adminAudioPreview.src = `/api/articles/${encodeURIComponent(article.id)}/audio?v=${encodeURIComponent(audio.updatedAt)}`;
    elements.adminAudioPreview.hidden = false;
    elements.adminAudioPreview.load();
  } else {
    elements.adminAudioPreview.removeAttribute("src");
    elements.adminAudioPreview.hidden = true;
    elements.adminAudioPreview.load();
  }
}

function inferAudioType(file) {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    ogg: "audio/ogg",
    webm: "audio/webm"
  }[extension] || "application/octet-stream";
}

async function uploadArticleAudio(file) {
  if (!state.currentArticle || state.audioBusy || !file) return;
  if (file.size > 100 * 1024 * 1024) {
    showEditorMessage("音频文件不能超过 100 MB。");
    return;
  }

  const articleId = state.currentArticle.id;
  state.audioBusy = true;
  elements.selectAudioButton.disabled = true;
  elements.deleteAudioButton.disabled = true;
  elements.adminAudioState.textContent = "正在上传音频…";
  showEditorMessage("");

  try {
    const response = await fetch(`/api/articles/${encodeURIComponent(articleId)}/audio`, {
      method: "PUT",
      headers: {
        "Content-Type": inferAudioType(file),
        "X-Audio-File-Name": encodeURIComponent(file.name)
      },
      body: file
    });
    const data = await response.json().catch(() => ({}));
    if (handleUnauthorized(response)) throw new Error("登录状态已失效。");
    if (!response.ok) throw new Error(data.error || `上传失败（${response.status}）`);

    if (state.currentArticle?.id === articleId) {
      state.currentArticle.audio = data.audio;
      renderArticleAudio(state.currentArticle);
      showEditorMessage("音频上传成功。");
    }
    await refreshLibrary();
  } catch (error) {
    if (state.currentArticle?.id === articleId) renderArticleAudio(state.currentArticle);
    showEditorMessage(error.message);
  } finally {
    state.audioBusy = false;
    elements.selectAudioButton.disabled = false;
    elements.deleteAudioButton.disabled = false;
  }
}

async function deleteArticleAudio() {
  if (!state.currentArticle?.audio || state.audioBusy) return;
  if (!window.confirm("确定删除这篇文章的音频吗？")) return;

  const articleId = state.currentArticle.id;
  state.audioBusy = true;
  elements.selectAudioButton.disabled = true;
  elements.deleteAudioButton.disabled = true;
  elements.adminAudioState.textContent = "正在删除音频…";

  try {
    await api(`/api/articles/${encodeURIComponent(articleId)}/audio`, { method: "DELETE" });
    if (state.currentArticle?.id === articleId) {
      delete state.currentArticle.audio;
      renderArticleAudio(state.currentArticle);
      showEditorMessage("音频已删除。");
    }
    await refreshLibrary();
  } catch (error) {
    if (state.currentArticle?.id === articleId) renderArticleAudio(state.currentArticle);
    showEditorMessage(error.message);
  } finally {
    state.audioBusy = false;
    elements.selectAudioButton.disabled = false;
    elements.deleteAudioButton.disabled = false;
  }
}

function openDirectoryDialog() {
  elements.directoryDialogMode.value = "create";
  elements.editingDirectoryId.value = "";
  elements.directoryDialogTitle.textContent = "新建目录";
  elements.directoryName.value = "";
  elements.directoryDialogMessage.textContent = "";
  elements.directoryDialog.showModal();
  queueMicrotask(() => elements.directoryName.focus());
}

function openRenameDirectoryDialog(directory) {
  elements.directoryDialogMode.value = "rename";
  elements.editingDirectoryId.value = directory.id;
  elements.directoryDialogTitle.textContent = "重命名目录";
  elements.directoryName.value = directory.name;
  elements.directoryDialogMessage.textContent = "";
  elements.directoryDialog.showModal();
  queueMicrotask(() => elements.directoryName.select());
}

async function submitDirectory(event) {
  event.preventDefault();
  const name = elements.directoryName.value.trim();
  if (!name) return;

  try {
    if (elements.directoryDialogMode.value === "rename") {
      await api(`/api/directories/${encodeURIComponent(elements.editingDirectoryId.value)}`, {
        method: "PATCH",
        body: JSON.stringify({ name })
      });
    } else {
      const { directory } = await api("/api/directories", {
        method: "POST",
        body: JSON.stringify({ name })
      });
      state.selectedDirectoryId = directory.id;
      state.openDirectoryIds.add(directory.id);
    }
    elements.directoryDialog.close();
    await refreshLibrary();
  } catch (error) {
    elements.directoryDialogMessage.textContent = error.message;
  }
}

async function deleteDirectory(directory) {
  const detail = directory.articles.length ? `其中的 ${directory.articles.length} 篇文章也会一起删除。` : "";
  if (!window.confirm(`确定删除目录“${directory.name}”吗？${detail}`)) return;
  if (state.currentArticle?.directoryId === directory.id && state.dirty && !canDiscardChanges()) return;

  try {
    await api(`/api/directories/${encodeURIComponent(directory.id)}`, { method: "DELETE" });
    if (state.currentArticle?.directoryId === directory.id) clearEditor();
    state.openDirectoryIds.delete(directory.id);
    state.selectedDirectoryId = null;
    await refreshLibrary();
  } catch (error) {
    window.alert(error.message);
  }
}

function openArticleDialog(directoryId = state.selectedDirectoryId) {
  if (!state.library.directories.length) {
    openDirectoryDialog();
    return;
  }
  updateDirectorySelects();
  elements.newArticleDirectory.value = directoryId || state.library.directories[0].id;
  elements.newArticleTitle.value = "";
  elements.articleDialogMessage.textContent = "";
  elements.articleDialog.showModal();
  queueMicrotask(() => elements.newArticleTitle.focus());
}

async function submitArticle(event) {
  event.preventDefault();
  const title = elements.newArticleTitle.value.trim();
  if (!title) return;

  try {
    const { article } = await api("/api/articles", {
      method: "POST",
      body: JSON.stringify({
        directoryId: elements.newArticleDirectory.value,
        title,
        content: ""
      })
    });
    elements.articleDialog.close();
    state.selectedDirectoryId = article.directoryId;
    state.openDirectoryIds.add(article.directoryId);
    await refreshLibrary();
    await selectArticle(article.id, { skipGuard: true });
    elements.textInput.focus();
  } catch (error) {
    elements.articleDialogMessage.textContent = error.message;
  }
}

function updateDirectorySelects() {
  for (const select of [elements.articleDirectory, elements.newArticleDirectory]) {
    const previousValue = select.value;
    select.replaceChildren();
    for (const directory of state.library.directories) {
      const option = document.createElement("option");
      option.value = directory.id;
      option.textContent = directory.name;
      select.append(option);
    }
    if ([...select.options].some((option) => option.value === previousValue)) {
      select.value = previousValue;
    }
  }
}

function updateCharacterCount() {
  elements.characterCount.textContent = `${new Intl.NumberFormat("zh-CN").format(elements.textInput.value.length)} 字`;
}

function setSaveState(message, kind = "saved") {
  elements.saveState.textContent = message;
  elements.saveState.className = `save-state${kind === "dirty" ? " is-dirty" : kind === "saving" ? " is-saving" : ""}`;
}

function showEditorMessage(message) {
  elements.editorMessage.textContent = message;
}

function canDiscardChanges() {
  if (state.audioBusy) {
    window.alert("请等待音频操作完成。");
    return false;
  }
  return !state.dirty || window.confirm("当前文章有未保存的修改，确定放弃这些修改吗？");
}

elements.newDirectoryButton.addEventListener("click", openDirectoryDialog);
elements.emptyNewDirectoryButton.addEventListener("click", openDirectoryDialog);
elements.directoryForm.addEventListener("submit", submitDirectory);
elements.articleForm.addEventListener("submit", submitArticle);
elements.saveButton.addEventListener("click", saveArticle);
elements.deleteArticleButton.addEventListener("click", deleteArticle);
elements.selectAudioButton.addEventListener("click", () => elements.audioFileInput.click());
elements.audioFileInput.addEventListener("change", () => uploadArticleAudio(elements.audioFileInput.files[0]));
elements.deleteAudioButton.addEventListener("click", deleteArticleAudio);
elements.textInput.addEventListener("input", markDirty);
elements.articleTitle.addEventListener("input", markDirty);
elements.articleDirectory.addEventListener("change", markDirty);

for (const button of document.querySelectorAll("[data-close-dialog]")) {
  button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDialog}`).close());
}

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveArticle();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty && !state.audioBusy) return;
  event.preventDefault();
  event.returnValue = "";
});

updateCharacterCount();
setupLogout(elements.logoutButton, { beforeLogout: canDiscardChanges });
initialize();
