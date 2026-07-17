import type { Chapter, ContentRating } from "@paperback/types";

export const DOMAIN = "https://lightnovelworld.org";
export const SEARCH_ENDPOINT = `${DOMAIN}/api/search/`;
export const CHAPTERS_PER_PAGE = 50;
export const CACHE_VERSION = 1;
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
