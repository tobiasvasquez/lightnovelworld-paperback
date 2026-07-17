import {
  ContentRating,
  type Chapter,
  type ChapterDetails,
  type SearchResultItem,
  type SourceManga,
} from "@paperback/types";
import * as cheerio from "cheerio";

import {
  CHAPTERS_PER_PAGE,
  absoluteUrl,
  mangaUrl,
  type ChapterPageInfo,
  type NovelPageInfo,
  type SearchNovel,
} from "./models";

const ADULT_GENRES = new Set(["adult", "ecchi", "harem", "josei", "mature", "smut"]);

export class LightNovelWorldParser {
  parseSearchResults(results: SearchNovel[]): SearchResultItem[] {
    return results.map((result) => ({
      mangaId: result.slug,
      title: result.title.trim(),
      subtitle: result.author.trim(),
      imageUrl: absoluteUrl(result.cover_path),
      contentRating: this.inferContentRating(result.genres ?? []),
    }));
  }

  parseNovelPage(mangaId: string, html: string): SourceManga {
    const details = this.parseNovelPageInfo(html);

    return {
      mangaId,
      mangaInfo: {
        thumbnailUrl: details.cover,
        synopsis: details.synopsis,
        primaryTitle: details.title,
        secondaryTitles: [],
        contentRating: details.contentRating,
        contentType: "novel",
        author: details.author,
        status: details.status,
        rating: details.rating,
        tagGroups: details.genres.length
          ? [
              {
                id: "genres",
                title: "Genres",
                tags: details.genres.map((genre) => ({
                  id: genre.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
                  title: genre,
                })),
              },
            ]
          : undefined,
        artworkUrls: details.cover ? [details.cover] : undefined,
        additionalInfo: {
          totalChapters: details.totalChapters ? String(details.totalChapters) : "",
        },
        shareUrl: mangaUrl(mangaId),
      },
    };
  }

  parseNovelPageInfo(html: string): NovelPageInfo {
    const $ = cheerio.load(html);
    const title = $(".novel-title").first().text().trim();
    const author = $(".novel-author .author-link").first().text().trim();
    const cover = absoluteUrl($(".novel-cover").first().attr("src"));
    const genres = $(".genre-tag")
      .map((_, element) => this.toTitleCase($(element).text().trim()))
      .get()
      .filter(Boolean);
    const ratingText = $(".rating-number").first().text().trim();
    const rating = ratingText ? Number(ratingText) : undefined;
    const status = $(".status-badge").first().text().trim() || undefined;
    const totalChapters = this.parseCountFromStatBoxes($, "Chapters");
    const summary = $(".summary-content").first().html()?.trim() ?? "";
    const synopsis =
      $("meta[name='description']").attr("content")?.trim() ??
      $(".description-text").first().text().replace(/\s+/g, " ").trim() ??
      "";

    return {
      title,
      author,
      cover,
      synopsis,
      summary: summary || synopsis,
      genres,
      status,
      rating: Number.isFinite(rating) ? rating : undefined,
      totalChapters,
      contentRating: this.inferContentRating(genres),
    };
  }

  parseChapterListPage(sourceManga: SourceManga, html: string, page: number): ChapterPageInfo {
    const $ = cheerio.load(html);
    const totalPages =
      Number($("#pageSelect option").last().attr("value") ?? $("#pageSelectBottom option").last().attr("value") ?? 1) ||
      1;
    const chapters = $(".chapters-grid .chapter-card")
      .map((index, element) => {
        const card = $(element);
        const onclick = card.attr("onclick") ?? "";
        const chapterPath = onclick.match(/'([^']+)'/)?.[1] ?? "";
        const chapterId = chapterPath.match(/\/chapter\/([^/]+)\/?/)?.[1] ?? card.find(".chapter-number").text().trim();
        const rawTitle = card.find(".chapter-title").text().replace(/\s+/g, " ").trim();
        const timeText = card.find(".chapter-time").text().replace(/\s+/g, " ").trim();
        const chapterNumber = Number(chapterId);

        return {
          chapterId,
          sourceManga,
          langCode: "en",
          chapNum: Number.isFinite(chapterNumber) ? chapterNumber : page * CHAPTERS_PER_PAGE + index + 1,
          title: this.normalizeChapterTitle(rawTitle, chapterId),
          publishDate: this.parseRelativeDate(timeText),
          sortingIndex: (page - 1) * CHAPTERS_PER_PAGE + index,
        } satisfies Chapter;
      })
      .get()
      .filter((chapter) => chapter.chapterId);

    return {
      totalPages,
      totalChapters: totalPages === 1 ? chapters.length : undefined,
      chapters,
    };
  }

  parseChapterDetails(chapter: Chapter, html: string): ChapterDetails {
    const $ = cheerio.load(html);
    const content = $(".chapter-text").first();

    if (!content.length) {
      throw new Error(`Could not locate chapter content for ${chapter.chapterId}`);
    }

    content.find("script, style, noscript, iframe, .chapter-ad-container, .chapter-promo").remove();
    content.find("[src]").each((_, element) => {
      const src = $(element).attr("src");
      if (src) {
        $(element).attr("src", absoluteUrl(src));
      }
    });
    content.find("[href]").each((_, element) => {
      const href = $(element).attr("href");
      if (href) {
        $(element).attr("href", absoluteUrl(href));
      }
    });

    const chapterHtml = (content.html() ?? "")
      .replaceAll(/\s+data-protected=(['"]).*?\1/gi, "")
      .replaceAll(/\s+on[a-z-]+=(['"]).*?\1/gi, "")
      .trim();

    if (!chapterHtml) {
      throw new Error(`Chapter content was empty for ${chapter.chapterId}`);
    }

    return {
      type: "html",
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      html: `<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8" /></head><body>${chapterHtml}</body></html>`,
    };
  }

  private parseCountFromStatBoxes($: cheerio.CheerioAPI, label: string): number | undefined {
    for (const element of $(".novel-stats-grid .stat-box").toArray()) {
      const box = $(element);
      const statLabel = box.find(".stat-label").first().text().replace(/\s+/g, " ").trim();
      if (statLabel.toLowerCase() !== label.toLowerCase()) {
        continue;
      }

      const value = box.find(".stat-value").first().text().replaceAll(",", "").trim();
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return undefined;
  }

  private inferContentRating(genres: string[]): ContentRating {
    const normalizedGenres = genres.map((genre) => genre.toLowerCase());
    return normalizedGenres.some((genre) => ADULT_GENRES.has(genre))
      ? ContentRating.MATURE
      : ContentRating.EVERYONE;
  }

  private normalizeChapterTitle(rawTitle: string, chapterId: string): string | undefined {
    const title = rawTitle.replace(/\s+/g, " ").trim();
    if (!title) {
      return undefined;
    }

    const escapedChapterId = chapterId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const cleaned = title
      .replace(new RegExp(`^Chapter\\s+${escapedChapterId}\\s*[-:]*\\s*`, "i"), "")
      .replace(new RegExp(`^${escapedChapterId}\\s*[-:]*\\s*`, "i"), "")
      .trim();

    return cleaned || title;
  }

  private parseRelativeDate(input: string): Date | undefined {
    const text = input.replaceAll("\u00a0", " ").replace(/\s+/g, " ").trim().toLowerCase();
    if (!text) {
      return undefined;
    }

    if (text.includes("just now")) {
      return new Date();
    }

    const unitMap: Record<string, number> = {
      minute: 60,
      minutes: 60,
      hour: 60 * 60,
      hours: 60 * 60,
      day: 60 * 60 * 24,
      days: 60 * 60 * 24,
      week: 60 * 60 * 24 * 7,
      weeks: 60 * 60 * 24 * 7,
      month: 60 * 60 * 24 * 30,
      months: 60 * 60 * 24 * 30,
      year: 60 * 60 * 24 * 365,
      years: 60 * 60 * 24 * 365,
    };

    let totalSeconds = 0;
    for (const match of text.matchAll(/(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)/g)) {
      const amount = Number(match[1]);
      const unit = match[2];
      totalSeconds += amount * (unitMap[unit] ?? 0);
    }

    return totalSeconds > 0 ? new Date(Date.now() - totalSeconds * 1000) : undefined;
  }

  private toTitleCase(input: string): string {
    return input.toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase());
  }
}
