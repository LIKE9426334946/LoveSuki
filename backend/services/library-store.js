import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "../utils/http.js";

const CATALOG_VERSION = 1;

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return structuredClone(value);
}

export class LibraryStore {
  constructor(dataDirectory) {
    this.dataDirectory = path.resolve(dataDirectory);
    this.articlesDirectory = path.join(this.dataDirectory, "articles");
    this.catalogPath = path.join(this.dataDirectory, "catalog.json");
    this.catalog = null;
    this.mutationQueue = Promise.resolve();
  }

  async initialize() {
    await mkdir(this.articlesDirectory, { recursive: true });

    try {
      const rawCatalog = await readFile(this.catalogPath, "utf8");
      this.catalog = this.validateCatalog(JSON.parse(rawCatalog));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;

      const timestamp = now();
      this.catalog = {
        version: CATALOG_VERSION,
        directories: [{
          id: randomUUID(),
          name: "默认目录",
          createdAt: timestamp,
          updatedAt: timestamp
        }],
        articles: []
      };
      await this.writeCatalog(this.catalog);
    }
  }

  listLibrary() {
    this.assertInitialized();
    const articleGroups = new Map(this.catalog.directories.map((directory) => [directory.id, []]));

    for (const article of this.catalog.articles) {
      articleGroups.get(article.directoryId)?.push(clone(article));
    }

    return {
      directories: this.catalog.directories.map((directory) => ({
        ...clone(directory),
        articles: articleGroups.get(directory.id) || []
      }))
    };
  }

  async getArticle(articleId) {
    this.assertInitialized();
    const article = this.findArticle(articleId);
    const content = await readFile(this.articlePath(article.id), "utf8");
    return { ...clone(article), content };
  }

  createDirectory(name) {
    return this.mutate(async () => {
      const timestamp = now();
      const directory = {
        id: randomUUID(),
        name,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const nextCatalog = clone(this.catalog);
      nextCatalog.directories.push(directory);
      await this.writeCatalog(nextCatalog);
      this.catalog = nextCatalog;
      return clone(directory);
    });
  }

  renameDirectory(directoryId, name) {
    return this.mutate(async () => {
      const nextCatalog = clone(this.catalog);
      const directory = nextCatalog.directories.find((item) => item.id === directoryId);
      if (!directory) throw new ApiError(404, "目录不存在。");

      directory.name = name;
      directory.updatedAt = now();
      await this.writeCatalog(nextCatalog);
      this.catalog = nextCatalog;
      return clone(directory);
    });
  }

  deleteDirectory(directoryId) {
    return this.mutate(async () => {
      const directory = this.catalog.directories.find((item) => item.id === directoryId);
      if (!directory) throw new ApiError(404, "目录不存在。");

      const articleIds = this.catalog.articles
        .filter((article) => article.directoryId === directoryId)
        .map((article) => article.id);
      const nextCatalog = clone(this.catalog);
      nextCatalog.directories = nextCatalog.directories.filter((item) => item.id !== directoryId);
      nextCatalog.articles = nextCatalog.articles.filter((article) => article.directoryId !== directoryId);

      await this.writeCatalog(nextCatalog);
      this.catalog = nextCatalog;
      await Promise.all(articleIds.map((articleId) => rm(this.articlePath(articleId), { force: true })));
      return { deletedDirectoryId: directoryId, deletedArticleIds: articleIds };
    });
  }

  createArticle({ directoryId, title, content }) {
    return this.mutate(async () => {
      this.findDirectory(directoryId);
      const timestamp = now();
      const article = {
        id: randomUUID(),
        directoryId,
        title,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const nextCatalog = clone(this.catalog);
      nextCatalog.articles.push(article);

      await this.writeArticle(article.id, content);
      try {
        await this.writeCatalog(nextCatalog);
      } catch (error) {
        await rm(this.articlePath(article.id), { force: true });
        throw error;
      }
      this.catalog = nextCatalog;
      return { ...clone(article), content };
    });
  }

  updateArticle(articleId, { title, content, directoryId }) {
    return this.mutate(async () => {
      const currentArticle = this.findArticle(articleId);
      this.findDirectory(directoryId);
      const nextCatalog = clone(this.catalog);
      const article = nextCatalog.articles.find((item) => item.id === currentArticle.id);
      article.title = title;
      article.content = undefined;
      article.directoryId = directoryId;
      article.updatedAt = now();

      await this.writeArticle(article.id, content);
      await this.writeCatalog(nextCatalog);
      this.catalog = nextCatalog;
      return { ...clone(article), content };
    });
  }

  deleteArticle(articleId) {
    return this.mutate(async () => {
      this.findArticle(articleId);
      const nextCatalog = clone(this.catalog);
      nextCatalog.articles = nextCatalog.articles.filter((article) => article.id !== articleId);
      await this.writeCatalog(nextCatalog);
      this.catalog = nextCatalog;
      await rm(this.articlePath(articleId), { force: true });
      return { deletedArticleId: articleId };
    });
  }

  findDirectory(directoryId) {
    const directory = this.catalog.directories.find((item) => item.id === directoryId);
    if (!directory) throw new ApiError(404, "目录不存在。");
    return directory;
  }

  findArticle(articleId) {
    const article = this.catalog.articles.find((item) => item.id === articleId);
    if (!article) throw new ApiError(404, "文章不存在。");
    return article;
  }

  articlePath(articleId) {
    return path.join(this.articlesDirectory, `${articleId}.md`);
  }

  async writeArticle(articleId, content) {
    await this.atomicWrite(this.articlePath(articleId), content);
  }

  async writeCatalog(catalog) {
    await this.atomicWrite(this.catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  }

  async atomicWrite(destination, content) {
    const temporaryPath = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, destination);
  }

  mutate(operation) {
    const result = this.mutationQueue.then(() => {
      this.assertInitialized();
      return operation();
    });
    this.mutationQueue = result.catch(() => undefined);
    return result;
  }

  assertInitialized() {
    if (!this.catalog) throw new Error("LibraryStore must be initialized before use.");
  }

  validateCatalog(catalog) {
    if (
      !catalog
      || catalog.version !== CATALOG_VERSION
      || !Array.isArray(catalog.directories)
      || !Array.isArray(catalog.articles)
    ) {
      throw new Error("LoveSuki data/catalog.json has an unsupported format.");
    }
    return catalog;
  }
}
