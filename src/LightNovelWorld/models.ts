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

export function absoluteUrl(url: string | undefined): string {
  if (!url) {
    return "";
  }

  try {
    return new URL(url, DOMAIN).toString();
  } catch {
    return url;
  }
}

export function mangaUrl(mangaId: string): string {
  return new URL(`/novel/${mangaId}/`, DOMAIN).toString();
}

export function chapterListUrl(mangaId: string, page: number): string {
  const url = new URL(`/novel/${mangaId}/chapters/`, DOMAIN);
  url.searchParams.set("page", String(page));
  return url.toString();
}

export function chapterUrl(mangaId: string, chapterId: string): string {
  return new URL(`/novel/${mangaId}/chapter/${chapterId}/`, DOMAIN).toString();
}

export function cacheKey(mangaId: string): string {
  return `lightnovelworld:chapters:v${CACHE_VERSION}:${mangaId}`;
}
