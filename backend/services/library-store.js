import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "../utils/http.js";

const CATALOG_VERSION = 1;
export const ARTICLE_AUDIO_LIMIT = 100 * 1024 * 1024;
const AUDIO_TYPES = new Map([
  ["audio/mpeg", ".mp3"],
  ["audio/mp4", ".m4a"],
  ["audio/m4a", ".m4a"],
  ["audio/x-m4a", ".m4a"],
  ["audio/aac", ".aac"],
  ["audio/x-aac", ".aac"],
  ["audio/wav", ".wav"],
  ["audio/x-wav", ".wav"],
  ["audio/x-pn-wav", ".wav"],
  ["audio/vnd.wave", ".wav"],
  ["audio/ogg", ".ogg"],
  ["application/ogg", ".ogg"],
  ["audio/webm", ".webm"]
]);

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
    this.audioDirectory = path.join(this.dataDirectory, "audio");
    this.catalogPath = path.join(this.dataDirectory, "catalog.json");
    this.catalog = null;
    this.mutationQueue = Promise.resolve();
  }

  async initialize() {
    await mkdir(this.articlesDirectory, { recursive: true });
    await mkdir(this.audioDirectory, { recursive: true });

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

  async getArticleAudio(articleId) {
    this.assertInitialized();
    const article = this.findArticle(articleId);
    if (!article.audio?.fileName) throw new ApiError(404, "这篇文章还没有音频。");

    const filePath = this.audioPath(article.audio.fileName);
    try {
      const fileStats = await stat(filePath);
      return { ...clone(article.audio), filePath, size: fileStats.size };
    } catch (error) {
      if (error?.code === "ENOENT") throw new ApiError(404, "文章音频文件不存在，请重新上传。");
      throw error;
    }
  }

  getArticleBySourceKey(sourceKey) {
    this.assertInitialized();
    const article = this.catalog.articles.find((item) => item.sourceKey === sourceKey);
    return article ? clone(article) : null;
  }

  upsertImportedArticle({ directoryName, title, content, sourceKey, sourceRevision }) {
    return this.mutate(async () => {
      const nextCatalog = clone(this.catalog);
      let directory = nextCatalog.directories.find((item) => item.name === directoryName);

      if (!directory) {
        const timestamp = now();
        directory = {
          id: randomUUID(),
          name: directoryName,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        nextCatalog.directories.unshift(directory);
      }

      const timestamp = now();
      let article = nextCatalog.articles.find((item) => item.sourceKey === sourceKey);
      const isNew = !article;

      if (isNew) {
        article = {
          id: randomUUID(),
          directoryId: directory.id,
          title,
          createdAt: timestamp,
          updatedAt: timestamp,
          sourceKey,
          sourceRevision
        };
        nextCatalog.articles.push(article);
      } else {
        article.title = title;
        article.updatedAt = timestamp;
        article.sourceRevision = sourceRevision;
      }

      await this.writeArticle(article.id, content);
      try {
        await this.writeCatalog(nextCatalog);
      } catch (error) {
        if (isNew) await rm(this.articlePath(article.id), { force: true });
        throw error;
      }

      this.catalog = nextCatalog;
      return { ...clone(article), content, imported: isNew };
    });
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
      const audioFiles = this.catalog.articles
        .filter((article) => article.directoryId === directoryId && article.audio?.fileName)
        .map((article) => article.audio.fileName);
      const nextCatalog = clone(this.catalog);
      nextCatalog.directories = nextCatalog.directories.filter((item) => item.id !== directoryId);
      nextCatalog.articles = nextCatalog.articles.filter((article) => article.directoryId !== directoryId);

      await this.writeCatalog(nextCatalog);
      this.catalog = nextCatalog;
      await Promise.all(articleIds.map((articleId) => rm(this.articlePath(articleId), { force: true })));
      await Promise.all(audioFiles.map((fileName) => rm(this.audioPath(fileName), { force: true })));
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
      const currentArticle = this.findArticle(articleId);
      const nextCatalog = clone(this.catalog);
      nextCatalog.articles = nextCatalog.articles.filter((article) => article.id !== articleId);
      await this.writeCatalog(nextCatalog);
      this.catalog = nextCatalog;
      await rm(this.articlePath(articleId), { force: true });
      if (currentArticle.audio?.fileName) {
        await rm(this.audioPath(currentArticle.audio.fileName), { force: true });
      }
      return { deletedArticleId: articleId };
    });
  }

  saveArticleAudio(articleId, { stream, contentType, originalName, declaredBytes = 0 }) {
    return this.mutate(async () => {
      const currentArticle = this.findArticle(articleId);
      const normalizedType = String(contentType || "").split(";", 1)[0].trim().toLowerCase();
      const extension = AUDIO_TYPES.get(normalizedType);
      if (!extension) {
        throw new ApiError(415, "不支持这种音频格式，请上传 MP3、M4A、AAC、WAV、OGG 或 WebM 文件。");
      }
      if (declaredBytes > ARTICLE_AUDIO_LIMIT) throw new ApiError(413, "音频文件不能超过 100 MB。");

      const cleanedOriginalName = path.basename(String(originalName || ""))
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 180);
      const safeOriginalName = cleanedOriginalName || `文章音频${extension}`;
      const fileName = `${articleId}-${randomUUID()}${extension}`;
      const destination = this.audioPath(fileName);
      const temporaryPath = `${destination}.tmp`;
      let size = 0;
      let handle;

      try {
        handle = await open(temporaryPath, "wx");
        for await (const chunk of stream) {
          size += chunk.length;
          if (size > ARTICLE_AUDIO_LIMIT) throw new ApiError(413, "音频文件不能超过 100 MB。");
          let offset = 0;
          while (offset < chunk.length) {
            const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
            offset += bytesWritten;
          }
        }
        if (size === 0) throw new ApiError(400, "音频文件不能为空。");
        await handle.close();
        handle = null;
        await rename(temporaryPath, destination);

        const nextCatalog = clone(this.catalog);
        const article = nextCatalog.articles.find((item) => item.id === currentArticle.id);
        const previousFileName = article.audio?.fileName;
        article.audio = {
          fileName,
          originalName: safeOriginalName,
          contentType: normalizedType,
          size,
          updatedAt: now()
        };
        article.updatedAt = now();

        try {
          await this.writeCatalog(nextCatalog);
        } catch (error) {
          await rm(destination, { force: true });
          throw error;
        }

        this.catalog = nextCatalog;
        if (previousFileName && previousFileName !== fileName) {
          await rm(this.audioPath(previousFileName), { force: true }).catch(() => undefined);
        }
        return clone(article.audio);
      } catch (error) {
        if (handle) await handle.close().catch(() => undefined);
        await rm(temporaryPath, { force: true });
        throw error;
      }
    });
  }

  deleteArticleAudio(articleId) {
    return this.mutate(async () => {
      const currentArticle = this.findArticle(articleId);
      if (!currentArticle.audio?.fileName) throw new ApiError(404, "这篇文章还没有音频。");

      const nextCatalog = clone(this.catalog);
      const article = nextCatalog.articles.find((item) => item.id === currentArticle.id);
      const fileName = article.audio.fileName;
      delete article.audio;
      article.updatedAt = now();
      await this.writeCatalog(nextCatalog);
      this.catalog = nextCatalog;
      await rm(this.audioPath(fileName), { force: true });
      return { deletedAudio: true, articleId };
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

  audioPath(fileName) {
    return path.join(this.audioDirectory, path.basename(fileName));
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
