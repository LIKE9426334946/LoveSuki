const DEFAULT_DIRECTORY_NAME = "默认目录";
const DEFAULT_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const DATE_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.md$/;

export class GitHubArticleSync {
  constructor({
    libraryStore,
    repository = "LIKE9426334946/LoveSuki",
    branch = "main",
    articlesDirectory = "daily-articles",
    directoryName = DEFAULT_DIRECTORY_NAME,
    refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
    fetchImpl = globalThis.fetch
  }) {
    this.libraryStore = libraryStore;
    this.repository = repository;
    this.branch = branch;
    this.articlesDirectory = articlesDirectory;
    this.directoryName = directoryName;
    this.refreshIntervalMs = refreshIntervalMs;
    this.fetchImpl = fetchImpl;
    this.lastCheckedAt = 0;
    this.syncPromise = null;
  }

  async sync({ force = false } = {}) {
    const age = Date.now() - this.lastCheckedAt;
    if (!force && this.lastCheckedAt > 0 && age < this.refreshIntervalMs) {
      return { checked: false, imported: 0, updated: 0 };
    }

    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = this.performSync().finally(() => {
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  async performSync() {
    const directoryUrl = new URL(
      `https://api.github.com/repos/${this.repository}/contents/${this.articlesDirectory}`
    );
    directoryUrl.searchParams.set("ref", this.branch);

    const response = await this.fetchImpl(directoryUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "LoveSuki-daily-article-sync"
      }
    });
    this.lastCheckedAt = Date.now();

    if (response.status === 404) return { checked: true, imported: 0, updated: 0 };
    if (!response.ok) {
      throw new Error(`GitHub article list request failed with status ${response.status}.`);
    }

    const entries = await response.json();
    if (!Array.isArray(entries)) throw new Error("GitHub article list response is invalid.");

    const files = entries
      .filter((entry) => entry.type === "file" && DATE_FILE_PATTERN.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name));
    let imported = 0;
    let updated = 0;

    for (const file of files) {
      const sourceKey = `github:${this.repository}:${file.path}`;
      const existing = this.libraryStore.getArticleBySourceKey(sourceKey);
      if (existing?.sourceRevision === file.sha) continue;

      const contentResponse = await this.fetchImpl(file.download_url, {
        headers: { "User-Agent": "LoveSuki-daily-article-sync" }
      });
      if (!contentResponse.ok) {
        throw new Error(`GitHub article request failed for ${file.name} with status ${contentResponse.status}.`);
      }

      const result = await this.libraryStore.upsertImportedArticle({
        directoryName: this.directoryName,
        title: file.name.slice(0, -3),
        content: await contentResponse.text(),
        sourceKey,
        sourceRevision: file.sha
      });
      if (result.imported) imported += 1;
      else updated += 1;
    }

    return { checked: true, imported, updated };
  }
}
