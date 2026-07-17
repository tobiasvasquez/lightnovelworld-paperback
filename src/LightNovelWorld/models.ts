import type { Chapter, ContentRating } from "@paperback/types";

export const DOMAIN = "https://lightnovelworld.org";
export const SEARCH_ENDPOINT = `${DOMAIN}/api/search/`;
export const CHAPTERS_PER_PAGE = 50;
export const CACHE_VERSION = 2;
export const CHAPTER_CACHE_CHUNK_SIZE = 500;
export const SPLIT_THRESHOLD = 1000;
export const PART_SIZE = 500;
export const LANGUAGE = "en";

export type SearchResponse = {
  novels?: SearchNovel[];
};

export type SearchNovel = {
  title: string;
  author: string;
  slug: string;
  genres?: string[];
  cover_path?: string;
  latest_chapter_number?: number;
  status?: string;
};

export type SerializedChapter = {
  chapterId: string;
  chapNum: number;
  title?: string;
  publishDate?: string;
  sortingIndex: number;
};

export type ChapterCache = {
  version: number;
  complete: boolean;
  fetchedPages: number[];
  totalPages?: number;
  totalChapters?: number;
  chapters: SerializedChapter[];
  updatedAt: string;
};

export type ChapterCacheMetadata = Omit<ChapterCache, "chapters"> & {
  chunkCount: number;
};

export type SplitPartInfo = {
  baseSlug: string;
  partNumber: number;
  rangeStart: number;
  rangeEnd: number;
};

export type NovelPageInfo = {
  title: string;
  author: string;
  cover: string;
  synopsis: string;
  summary: string;
  genres: string[];
  status?: string;
  rating?: number;
  totalChapters?: number;
  contentRating: ContentRating;
};

export type ChapterPageInfo = {
  totalPages: number;
  totalChapters?: number;
  chapters: Chapter[];
};

function joinUrl(base: string, path: string): string {
  if (!path) {
    return base;
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  if (path.startsWith("//")) {
    return `https:${path}`;
  }

  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function absoluteUrl(url: string | undefined): string {
  if (!url) {
    return "";
  }

  return joinUrl(DOMAIN, url);
}

export function mangaUrl(mangaId: string): string {
  return `${DOMAIN}/novel/${encodeURIComponent(mangaId)}/`;
}

export function chapterListUrl(mangaId: string, page: number): string {
  return `${mangaUrl(mangaId)}chapters/?page=${encodeURIComponent(String(page))}`;
}

export function chapterUrl(mangaId: string, chapterId: string): string {
  return `${mangaUrl(mangaId)}chapter/${encodeURIComponent(chapterId)}/`;
}

export function cacheKey(mangaId: string): string {
  return `lightnovelworld:chapters:v${CACHE_VERSION}:${mangaId}`;
}

export function cacheChunkKey(mangaId: string, chunkIndex: number): string {
  return `${cacheKey(mangaId)}:chunk:${chunkIndex}`;
}

export function shouldSplitTitle(totalChapters: number | undefined): totalChapters is number {
  return typeof totalChapters === "number" && totalChapters > SPLIT_THRESHOLD;
}

export function getPartCount(totalChapters: number): number {
  return Math.max(1, Math.ceil(totalChapters / PART_SIZE));
}

export function getSplitPart(baseSlug: string, partNumber: number): SplitPartInfo {
  const rangeStart = (partNumber - 1) * PART_SIZE + 1;
  return {
    baseSlug,
    partNumber,
    rangeStart,
    rangeEnd: rangeStart + PART_SIZE - 1,
  };
}

export function createPartMangaId(baseSlug: string, partNumber: number): string {
  return `${baseSlug}::part:${partNumber}`;
}

export function parsePartMangaId(mangaId: string): SplitPartInfo | undefined {
  const match = mangaId.match(/^(.*)::part:(\d+)$/);
  if (!match) {
    return undefined;
  }

  const [, baseSlug, rawPartNumber] = match;
  const partNumber = Number(rawPartNumber);
  if (!baseSlug || !Number.isInteger(partNumber) || partNumber < 1) {
    return undefined;
  }

  return getSplitPart(baseSlug, partNumber);
}

export function buildPartTitle(title: string, partNumber: number): string {
  return `${title} Part ${String(partNumber).padStart(2, "0")}`;
}

export function formatPartRange(part: SplitPartInfo, totalChapters?: number): string {
  const rangeEnd = totalChapters ? Math.min(totalChapters, part.rangeEnd) : part.rangeEnd;
  return `${part.rangeStart}-${rangeEnd}`;
}

export function getVisiblePartChapterCount(part: SplitPartInfo, totalChapters: number): number {
  if (totalChapters < part.rangeStart) {
    return 0;
  }

  return Math.max(0, Math.min(totalChapters, part.rangeEnd) - part.rangeStart + 1);
}
