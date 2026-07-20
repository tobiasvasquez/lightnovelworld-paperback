import { ContentRating } from "@paperback/types";

export const DOMAIN = "https://www.skynovels.net";
export const API_DOMAIN = "https://api.skynovels.net";
export const LANGUAGE = "es";
export const SEARCH_PAGE_SIZE = 50;

const ADULT_GENRES = new Set([
  "adult",
  "adulto",
  "ecchi",
  "erotica",
  "erotico",
  "harem",
  "josei",
  "mature",
  "maduro",
  "nsfw",
  "smut",
  "yaoi",
  "yuri",
]);

export type SkyNovelsSearchResponse = {
  novels?: SkyNovelsNovelSummary[];
  page?: number;
  limit?: number;
  total?: number;
};

export type SkyNovelsNovelSummary = {
  id: number;
  nvl_title: string;
  nvl_titlealternative?: string | null;
  nvl_name: string;
  nvl_acronym?: string | null;
  image?: string | null;
  nvl_writer?: string | null;
  nvl_status?: string | null;
  nvl_origin?: string | null;
  nvl_chapters?: number | null;
  nvl_rating?: number | null;
  nvl_ratings_count?: number | null;
  nvl_content?: string | null;
};

export type SkyNovelsNovelBaseResponse = {
  novel: SkyNovelsNovelBase;
};

export type SkyNovelsNovelBase = {
  id: number;
  nvl_title: string;
  nvl_titlealternative?: string | null;
  nvl_name: string;
  nvl_acronym?: string | null;
  image?: string | null;
  nvl_writer?: string | null;
  nvl_origin?: string | null;
  nvl_translator?: string | null;
  nvl_content?: string | null;
  nvl_translatorcomment?: string | null;
  nvl_status?: string | null;
  nvl_publication_date?: string | null;
  updatedAt?: string | null;
};

export type SkyNovelsGenresResponse = {
  genres?: SkyNovelsGenre[];
};

export type SkyNovelsGenre = {
  id: number;
  genre_name: string;
};

export type SkyNovelsStatsResponse = {
  nvl_chapters?: number;
  nvl_last_update?: string | null;
  nvl_rating?: number | null;
  nvl_ratings_count?: number | null;
  nvl_comments_count?: number | null;
  nvl_reactions_count?: number | null;
  nvl_bookmarks_count?: number | null;
};

export type SkyNovelsVolumesResponse = {
  volumes?: SkyNovelsVolume[];
};

export type SkyNovelsVolume = {
  id: number;
  vlm_title: string;
  chapters_count?: number;
};

export type SkyNovelsVolumeChaptersResponse = {
  items?: SkyNovelsVolumeChapter[];
  pagination?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    hasMore?: boolean;
  };
};

export type SkyNovelsVolumeChapter = {
  id: number;
  chp_index_title?: string | null;
  chp_name?: string | null;
  chp_title?: string | null;
  chp_number?: number | null;
  isVip?: string | number | null;
  chp_status?: string | null;
  view_count?: number | null;
  createdAt?: string | null;
  vipUnlocked?: number | boolean | null;
};

export type SkyNovelsChapterResponse = {
  chapter: SkyNovelsChapterDetails;
};

export type SkyNovelsChapterDetails = {
  id: number;
  chp_index_title?: string | null;
  chp_name?: string | null;
  chp_title?: string | null;
  chp_content?: string | null;
  chp_number?: number | null;
  chp_status?: string | null;
  chp_review?: string | null;
  chp_translator?: string | null;
  isVip?: string | number | null;
  nvl_id?: number | null;
  volume_id?: number | null;
  vlm_id?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  nvl_title?: string | null;
  nvl_name?: string | null;
  author_login?: string | null;
};

function buildQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function searchApiUrl(query: string): string {
  const params = buildQueryString({
    page: "1",
    limit: String(SEARCH_PAGE_SIZE),
    q: query,
    order: "title",
    direction: "ASC",
    _ts: String(Date.now()),
  });
  return `${API_DOMAIN}/api/novels?${params}`;
}

export function novelBaseApiUrl(novelId: string): string {
  return `${API_DOMAIN}/api/novels/${encodeURIComponent(novelId)}/base`;
}

export function novelGenresApiUrl(novelId: string): string {
  return `${API_DOMAIN}/api/novels/${encodeURIComponent(novelId)}/genres`;
}

export function novelStatsApiUrl(novelId: string): string {
  return `${API_DOMAIN}/api/novels/${encodeURIComponent(novelId)}/stats`;
}

export function novelVolumesApiUrl(novelId: string): string {
  return `${API_DOMAIN}/api/novels/${encodeURIComponent(novelId)}/volumes`;
}

export function volumeChaptersApiUrl(novelId: string, volumeId: number): string {
  const params = buildQueryString({
    page: "1",
    limit: "2000",
    _ts: String(Date.now()),
  });
  return `${API_DOMAIN}/api/volumes/${encodeURIComponent(novelId)}/${encodeURIComponent(String(volumeId))}/chapters?${params}`;
}

export function chapterApiUrl(chapterId: string): string {
  return `${API_DOMAIN}/api/chapters/${encodeURIComponent(chapterId)}`;
}

export function novelUrl(novelId: string | number, slug?: string | null): string {
  const baseUrl = `${DOMAIN}/novelas/${encodeURIComponent(String(novelId))}`;
  return slug ? `${baseUrl}/${encodeURIComponent(slug)}` : baseUrl;
}

export function novelCoverUrl(image: string | null | undefined): string {
  if (!image) {
    return "";
  }

  if (image.startsWith("http://") || image.startsWith("https://")) {
    return image;
  }

  return `${API_DOMAIN}/api/get-image/${image}/novels/false`;
}

export function absoluteSkyNovelsUrl(url: string | null | undefined): string {
  if (!url) {
    return "";
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  if (url.startsWith("/api/")) {
    return `${API_DOMAIN}${url}`;
  }

  if (url.startsWith("/")) {
    return `${DOMAIN}${url}`;
  }

  return `${DOMAIN}/${url.replace(/^\.\//, "")}`;
}

export function normalizeSearchText(input: string | null | undefined): string {
  return (input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/[^a-z0-9\s.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeWhitespace(input: string | null | undefined): string {
  return (input ?? "").replace(/\s+/g, " ").trim();
}

export function slugifyTag(input: string): string {
  return normalizeSearchText(input).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function inferContentRating(genres: string[]): ContentRating {
  const normalizedGenres = genres.map((genre) => normalizeSearchText(genre));
  return normalizedGenres.some((genre) => ADULT_GENRES.has(genre))
    ? ContentRating.MATURE
    : ContentRating.EVERYONE;
}

export function mapNovelStatus(status: string | null | undefined): string | undefined {
  const normalizedStatus = normalizeSearchText(status);
  switch (normalizedStatus) {
    case "active":
      return "Activa";
    case "inactive":
      return "Inactiva";
    case "finished":
      return "Finalizada";
    default:
      return normalizeWhitespace(status) || undefined;
  }
}

export function parseVolumeNumber(title: string | null | undefined): number | undefined {
  const match = normalizeSearchText(title).match(/\b(?:volumen|volume|vol)\s+(\d+)\b/);
  if (!match) {
    return undefined;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseChapterNumber(chapter: SkyNovelsVolumeChapter | SkyNovelsChapterDetails): number | undefined {
  const candidates = [chapter.chp_index_title, chapter.chp_title, chapter.chp_name];

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeSearchText(candidate);
    if (!normalizedCandidate) {
      continue;
    }

    const chapterMatch = normalizedCandidate.match(
      /\b(?:capitulo|chapter|episode|episodio|ep|chp|cap)\s+(\d+)(?:[.,](\d+)|\s+(\d+))?\b/,
    );
    if (chapterMatch) {
      const [, wholePart, decimalPart, splitPart] = chapterMatch;
      const suffix = decimalPart ?? splitPart;
      const parsed = Number(suffix ? `${wholePart}.${suffix}` : wholePart);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  const fallbackNumber = typeof chapter.chp_number === "number" ? chapter.chp_number : undefined;
  return Number.isFinite(fallbackNumber) ? fallbackNumber : undefined;
}

export function cleanChapterTitle(title: string | null | undefined): string | undefined {
  const normalizedTitle = normalizeWhitespace(title);
  if (!normalizedTitle) {
    return undefined;
  }

  const cleanedTitle = normalizedTitle
    .replace(/^([A-Z0-9]{1,10}\s*[\u2013-]\s*)?Cap(?:i|\u00ed)tulo\s+\d+(?:[.,]\d+)?\s*[-:\u2013]\s*/i, "")
    .replace(/^([A-Z0-9]{1,10}\s*[\u2013-]\s*)?Chapter\s+\d+(?:[.,]\d+)?\s*[-:\u2013]\s*/i, "")
    .trim();

  return cleanedTitle || normalizedTitle;
}

export function buildSearchScore(query: string, novel: SkyNovelsNovelSummary): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const searchableFields = [novel.nvl_title, novel.nvl_titlealternative, novel.nvl_acronym, novel.nvl_name]
    .map((field) => normalizeSearchText(field))
    .filter(Boolean);

  let bestScore = 0;
  for (const field of searchableFields) {
    if (field === normalizedQuery) {
      bestScore = Math.max(bestScore, 1000);
      continue;
    }

    if (field.startsWith(normalizedQuery)) {
      bestScore = Math.max(bestScore, 800);
      continue;
    }

    if (field.includes(normalizedQuery)) {
      bestScore = Math.max(bestScore, 600);
      continue;
    }

    if (tokens.length > 1 && tokens.every((token) => field.includes(token))) {
      bestScore = Math.max(bestScore, 400);
      continue;
    }

    if (tokens.some((token) => field.includes(token))) {
      bestScore = Math.max(bestScore, 200);
    }
  }

  return bestScore + Number(novel.nvl_ratings_count ?? 0);
}

export function hasStrongSearchMatch(query: string, novels: SkyNovelsNovelSummary[]): boolean {
  return novels.some((novel) => buildSearchScore(query, novel) >= 400);
}
