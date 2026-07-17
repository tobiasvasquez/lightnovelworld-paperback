import {
  type Chapter,
  type ChapterDetails,
  type ExtensionImpl,
  type Metadata,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SortingOption,
  type SourceManga,
  type UpdateManager,
} from "@paperback/types";

import {
  CACHE_VERSION,
  CHAPTER_CACHE_CHUNK_SIZE,
  CHAPTERS_PER_PAGE,
  SEARCH_ENDPOINT,
  cacheChunkKey,
  cacheKey,
  chapterListUrl,
  chapterUrl,
  type ChapterCacheMetadata,
  mangaUrl,
  type ChapterCache,
  type SerializedChapter,
  type SearchResponse,
} from "./models";
import { fetchHTML, fetchJSON, mainRateLimiter } from "./network";
import { LightNovelWorldParser } from "./parser";
import LightNovelWorldConfig from "./pbconfig";

export class LightNovelWorldExtension implements ExtensionImpl<typeof LightNovelWorldConfig> {
  private readonly parser = new LightNovelWorldParser();

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const html = await fetchHTML(mangaUrl(mangaId), `${mangaUrl(mangaId)}`);
    return this.parser.parseNovelPage(mangaId, html);
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    _metadata: Metadata | undefined,
    _sortingOption: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const title = query.title.trim();
    if (!title) {
      return { items: [] };
    }

    const url = `${SEARCH_ENDPOINT}?q=${encodeURIComponent(title)}&search_type=title`;
    const response = await fetchJSON<SearchResponse>(url);
    return {
      items: this.parser.parseSearchResults(response.novels ?? []),
    };
  }

  async getChapters(sourceManga: SourceManga, sinceDate?: Date): Promise<Chapter[]> {
    const cache = this.getCache(sourceManga.mangaId);

    if (sinceDate) {
      const latestChapterCount = await this.getLatestChapterCount(sourceManga);
      const knownChapterCount = sourceManga.chapterCount ?? cache?.chapters.length ?? 0;

      if (latestChapterCount !== undefined && knownChapterCount > 0) {
        if (latestChapterCount <= knownChapterCount) {
          return [];
        }

        const newChapters = await this.fetchNewestChapters(
          sourceManga,
          latestChapterCount - knownChapterCount,
          latestChapterCount,
        );
        this.mergeIntoCache(sourceManga.mangaId, cache, newChapters, undefined, latestChapterCount);
        return newChapters.filter((chapter) => !chapter.publishDate || chapter.publishDate > sinceDate);
      }
    }

    if (cache?.complete) {
      try {
        const latestChapterCount = await this.getLatestChapterCount(sourceManga);

        if (latestChapterCount !== undefined) {
          if (latestChapterCount === cache.chapters.length) {
            return this.hydrateChapters(cache.chapters, sourceManga);
          }

          if (latestChapterCount > cache.chapters.length) {
            const newChapters = await this.fetchNewestChapters(
              sourceManga,
              latestChapterCount - cache.chapters.length,
              latestChapterCount,
            );
            const updatedCache = this.mergeIntoCache(
              sourceManga.mangaId,
              cache,
              newChapters,
              undefined,
              latestChapterCount,
            );
            return this.hydrateChapters(updatedCache.chapters, sourceManga);
          }
        }

        return this.hydrateChapters(cache.chapters, sourceManga);
      } catch {
        return this.hydrateChapters(cache.chapters, sourceManga);
      }
    }

    const fullCache = await this.fetchAllChapters(sourceManga, cache);
    return this.hydrateChapters(fullCache.chapters, sourceManga);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = chapterUrl(chapter.sourceManga.mangaId, chapter.chapterId);
    const html = await fetchHTML(url, mangaUrl(chapter.sourceManga.mangaId));
    return this.parser.parseChapterDetails(chapter, html);
  }

  async processTitlesForUpdates(
    updateManager: UpdateManager,
    _lastUpdateDate?: Date,
  ): Promise<void> {
    for (const sourceManga of updateManager.getQueuedItems()) {
      try {
        const latestChapterCount = await this.getLatestChapterCount(sourceManga);
        const knownChapterCount =
          sourceManga.chapterCount ?? (await updateManager.getNumberOfChapters(sourceManga.mangaId));

        if (latestChapterCount === undefined) {
          await updateManager.setUpdatePriority(sourceManga.mangaId, "high");
          continue;
        }

        if (latestChapterCount <= knownChapterCount) {
          await updateManager.setUpdatePriority(sourceManga.mangaId, "skip");
          continue;
        }

        const newChapters = await this.fetchNewestChapters(
          sourceManga,
          latestChapterCount - knownChapterCount,
          latestChapterCount,
        );

        if (newChapters.length === latestChapterCount - knownChapterCount) {
          await updateManager.setNewChapters(sourceManga.mangaId, newChapters);
        }

        this.mergeIntoCache(sourceManga.mangaId, this.getCache(sourceManga.mangaId), newChapters, undefined, latestChapterCount);
        await updateManager.setUpdatePriority(sourceManga.mangaId, "high");
      } catch {
        await updateManager.setUpdatePriority(sourceManga.mangaId, "high");
      }
    }
  }

  async initialise(): Promise<void> {
    mainRateLimiter.registerInterceptor();
  }

  private async fetchAllChapters(sourceManga: SourceManga, cache?: ChapterCache): Promise<ChapterCache> {
    let workingCache = cache ?? this.createEmptyCache();
    const knownTotalChapters = this.getKnownChapterCount(sourceManga) ?? workingCache.totalChapters;
    const expectedPages = knownTotalChapters ? Math.max(1, Math.ceil(knownTotalChapters / CHAPTERS_PER_PAGE)) : undefined;

    if (!workingCache.totalPages) {
      const firstPage = await this.fetchChapterPage(sourceManga, 1);
      workingCache = this.mergeIntoCache(
        sourceManga.mangaId,
        workingCache,
        firstPage.chapters,
        1,
        firstPage.totalChapters ?? knownTotalChapters,
        firstPage.totalPages,
      );
    }

    const totalPages = workingCache.totalPages ?? expectedPages ?? 1;
    for (let page = 1; page <= totalPages; page += 1) {
      if (workingCache.fetchedPages.includes(page)) {
        continue;
      }

      const chapterPage = await this.fetchChapterPage(sourceManga, page);
      workingCache = this.mergeIntoCache(
        sourceManga.mangaId,
        workingCache,
        chapterPage.chapters,
        page,
        chapterPage.totalChapters ?? knownTotalChapters,
        chapterPage.totalPages,
      );
    }

    const normalizedCache = this.normalizeCache({
      ...workingCache,
      complete: totalPages > 0 && workingCache.fetchedPages.length >= totalPages,
      totalPages,
      totalChapters: knownTotalChapters ?? workingCache.totalChapters ?? workingCache.chapters.length,
      updatedAt: new Date().toISOString(),
    });
    return this.saveCache(sourceManga.mangaId, normalizedCache);
  }

  private async fetchNewestChapters(
    sourceManga: SourceManga,
    newChapterCount: number,
    latestChapterCount: number,
  ): Promise<Chapter[]> {
    const totalPages = Math.max(1, Math.ceil(latestChapterCount / CHAPTERS_PER_PAGE));
    const collected: Chapter[] = [];

    for (let page = totalPages; page >= 1 && collected.length < newChapterCount; page -= 1) {
      const chapterPage = await this.fetchChapterPage(sourceManga, page);
      collected.push(...chapterPage.chapters);
    }

    return collected
      .sort((left, right) => (left.sortingIndex ?? 0) - (right.sortingIndex ?? 0))
      .slice(-newChapterCount);
  }

  private async fetchChapterPage(sourceManga: SourceManga, page: number) {
    const url = chapterListUrl(sourceManga.mangaId, page);
    const html = await fetchHTML(url, mangaUrl(sourceManga.mangaId));
    return this.parser.parseChapterListPage(sourceManga, html, page);
  }

  private async getLatestChapterCount(sourceManga: SourceManga): Promise<number | undefined> {
    const html = await fetchHTML(mangaUrl(sourceManga.mangaId), mangaUrl(sourceManga.mangaId));
    return this.parser.parseNovelPageInfo(html).totalChapters;
  }

  private getKnownChapterCount(sourceManga: SourceManga): number | undefined {
    const totalChapters = sourceManga.mangaInfo.additionalInfo?.totalChapters;
    if (!totalChapters) {
      return undefined;
    }

    const parsed = Number(totalChapters);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private getCache(mangaId: string): ChapterCache | undefined {
    const state = Application.getState(cacheKey(mangaId));
    if (!state || typeof state !== "object") {
      return undefined;
    }

    const cache = state as Partial<ChapterCacheMetadata>;
    if (
      cache.version !== CACHE_VERSION ||
      !Array.isArray(cache.fetchedPages) ||
      typeof cache.chunkCount !== "number"
    ) {
      return undefined;
    }

    const chapters: SerializedChapter[] = [];
    for (let chunkIndex = 0; chunkIndex < cache.chunkCount; chunkIndex += 1) {
      const chunk = Application.getState(cacheChunkKey(mangaId, chunkIndex));
      if (!Array.isArray(chunk)) {
        return undefined;
      }

      chapters.push(...chunk.filter(this.isSerializedChapter));
    }

    return this.normalizeCache({
      version: cache.version,
      complete: Boolean(cache.complete),
      fetchedPages: cache.fetchedPages.filter((page): page is number => typeof page === "number"),
      totalPages: typeof cache.totalPages === "number" ? cache.totalPages : undefined,
      totalChapters: typeof cache.totalChapters === "number" ? cache.totalChapters : undefined,
      chapters,
      updatedAt: typeof cache.updatedAt === "string" ? cache.updatedAt : new Date(0).toISOString(),
    });
  }

  private mergeIntoCache(
    mangaId: string,
    cache: ChapterCache | undefined,
    chapters: Chapter[],
    fetchedPage?: number,
    totalChapters?: number,
    totalPages?: number,
  ): ChapterCache {
    const workingCache = cache ?? this.createEmptyCache();
    const merged = new Map<string, SerializedChapter>();

    for (const chapter of workingCache.chapters) {
      merged.set(chapter.chapterId, chapter);
    }

    for (const chapter of chapters) {
      merged.set(chapter.chapterId, this.serializeChapter(chapter));
    }

    const fetchedPages = new Set<number>(workingCache.fetchedPages);
    if (fetchedPage !== undefined) {
      fetchedPages.add(fetchedPage);
    }

    const resolvedTotalPages =
      totalPages ?? workingCache.totalPages ?? (totalChapters ? Math.ceil(totalChapters / CHAPTERS_PER_PAGE) : undefined);

    const normalizedCache = this.normalizeCache({
      version: CACHE_VERSION,
      complete: workingCache.complete,
      fetchedPages: [...fetchedPages],
      totalPages: resolvedTotalPages,
      totalChapters: totalChapters ?? workingCache.totalChapters,
      chapters: [...merged.values()],
      updatedAt: new Date().toISOString(),
    });

    return this.saveCache(mangaId, normalizedCache);
  }

  private normalizeCache(cache: ChapterCache): ChapterCache {
    const chapters = [...cache.chapters].sort((left, right) => left.sortingIndex - right.sortingIndex);
    const fetchedPages = [...new Set(cache.fetchedPages)].sort((left, right) => left - right);
    const totalPages = cache.totalPages;

    return {
      ...cache,
      complete: totalPages !== undefined ? fetchedPages.length >= totalPages : cache.complete,
      fetchedPages,
      chapters,
    };
  }

  private hydrateChapters(serializedChapters: SerializedChapter[], sourceManga: SourceManga): Chapter[] {
    return serializedChapters.map((chapter) => ({
      chapterId: chapter.chapterId,
      sourceManga,
      langCode: "en",
      chapNum: chapter.chapNum,
      title: chapter.title,
      publishDate: chapter.publishDate ? new Date(chapter.publishDate) : undefined,
      sortingIndex: chapter.sortingIndex,
    }));
  }

  private serializeChapter(chapter: Chapter): SerializedChapter {
    return {
      chapterId: chapter.chapterId,
      chapNum: chapter.chapNum,
      title: chapter.title,
      publishDate: chapter.publishDate?.toISOString(),
      sortingIndex: chapter.sortingIndex ?? 0,
    };
  }

  private createEmptyCache(): ChapterCache {
    return {
      version: CACHE_VERSION,
      complete: false,
      fetchedPages: [],
      chapters: [],
      updatedAt: new Date(0).toISOString(),
    };
  }

  private isSerializedChapter(value: unknown): value is SerializedChapter {
    if (!value || typeof value !== "object") {
      return false;
    }

    const chapter = value as Partial<SerializedChapter>;
    return (
      typeof chapter.chapterId === "string" &&
      typeof chapter.chapNum === "number" &&
      typeof chapter.sortingIndex === "number"
    );
  }

  private saveCache(mangaId: string, cache: ChapterCache): ChapterCache {
    const normalizedCache = this.normalizeCache(cache);
    const chunks = this.chunkChapters(normalizedCache.chapters);
    const existingState = Application.getState(cacheKey(mangaId));
    const existingChunkCount =
      existingState && typeof existingState === "object" && typeof (existingState as Partial<ChapterCacheMetadata>).chunkCount === "number"
        ? (existingState as ChapterCacheMetadata).chunkCount
        : 0;

    const metadata: ChapterCacheMetadata = {
      version: normalizedCache.version,
      complete: normalizedCache.complete,
      fetchedPages: normalizedCache.fetchedPages,
      totalPages: normalizedCache.totalPages,
      totalChapters: normalizedCache.totalChapters,
      updatedAt: normalizedCache.updatedAt,
      chunkCount: chunks.length,
    };

    for (const [index, chunk] of chunks.entries()) {
      Application.setState(chunk, cacheChunkKey(mangaId, index));
    }

    for (let chunkIndex = chunks.length; chunkIndex < existingChunkCount; chunkIndex += 1) {
      Application.setState([], cacheChunkKey(mangaId, chunkIndex));
    }

    Application.setState(metadata, cacheKey(mangaId));

    return normalizedCache;
  }

  private chunkChapters(chapters: SerializedChapter[]): SerializedChapter[][] {
    const chunks: SerializedChapter[][] = [];
    for (let index = 0; index < chapters.length; index += CHAPTER_CACHE_CHUNK_SIZE) {
      chunks.push(chapters.slice(index, index + CHAPTER_CACHE_CHUNK_SIZE));
    }
    return chunks;
  }
}

export const LightNovelWorld = new LightNovelWorldExtension();
