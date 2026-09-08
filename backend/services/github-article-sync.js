const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class GitHubArticleSync {
  constructor({
    libraryStore,
    repository = "LIKE9426334946/LoveSuki",
    branch = "main",
    articlesDirectory = "daily-articles",
    fetchImpl = globalThis.fetch
  }) {
    this.libraryStore = libraryStore;
    this.repository = repository;
    this.branch = branch;
    this.articlesDirectory = articlesDirectory;
    this.fetchImpl = fetchImpl;
    this.syncPromise = null;
    this.syncingDate = null;
  }

  getSourceKey(dateKey) {
    return `github:${this.repository}:${this.articlesDirectory}/${dateKey}.md`;
  }

  hasImportedDate(dateKey) {
    return Boolean(this.libraryStore.getArticleBySourceKey(this.getSourceKey(dateKey)));
  }

  async syncDate(dateKey) {
    if (!DATE_KEY_PATTERN.test(dateKey)) throw new Error("Daily article date must use YYYY-MM-DD.");
    if (this.hasImportedDate(dateKey)) {
      return { available: true, checked: false, imported: 0, updated: 0 };
    }

    if (this.syncPromise && this.syncingDate === dateKey) return this.syncPromise;
    if (this.syncPromise) await this.syncPromise;

    this.syncingDate = dateKey;
    this.syncPromise = this.performDateSync(dateKey).finally(() => {
      this.syncPromise = null;
      this.syncingDate = null;
    });
    return this.syncPromise;
  }

  async performDateSync(dateKey) {
    const filePath = `${this.articlesDirectory}/${dateKey}.md`;
    const fileUrl = new URL(`https://api.github.com/repos/${this.repository}/contents/${filePath}`);
    fileUrl.searchParams.set("ref", this.branch);

    const response = await this.fetchImpl(fileUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "LoveSuki-daily-article-sync"
      }
    });

    if (response.status === 404) {
      return { available: false, checked: true, imported: 0, updated: 0 };
    }
    if (!response.ok) {
      throw new Error(`GitHub article metadata request failed with status ${response.status}.`);
    }

    const file = await response.json();
    if (file?.type !== "file" || !file.download_url || !file.sha) {
      throw new Error(`GitHub article metadata is invalid for ${dateKey}.`);
    }

    const contentResponse = await this.fetchImpl(file.download_url, {
      headers: { "User-Agent": "LoveSuki-daily-article-sync" }
    });
    if (!contentResponse.ok) {
      throw new Error(`GitHub article request failed for ${dateKey}.md with status ${contentResponse.status}.`);
    }

    const result = await this.libraryStore.upsertImportedArticle({
      directoryName: dateKey.slice(0, 7),
      title: dateKey,
      content: await contentResponse.text(),
      sourceKey: this.getSourceKey(dateKey),
      sourceRevision: file.sha
    });

    return {
      available: true,
      checked: true,
      imported: result.imported ? 1 : 0,
      updated: result.imported ? 0 : 1
    };
  }
}
