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
  chapterApiUrl,
  hasStrongSearchMatch,
  novelBaseApiUrl,
  novelGenresApiUrl,
  novelStatsApiUrl,
  novelVolumesApiUrl,
  searchApiUrl,
  volumeChaptersApiUrl,
  buildSearchScore,
  type SkyNovelsChapterResponse,
  type SkyNovelsNovelBaseResponse,
  type SkyNovelsNovelSummary,
  type SkyNovelsGenresResponse,
  type SkyNovelsSearchResponse,
  type SkyNovelsStatsResponse,
  type SkyNovelsVolumesResponse,
  type SkyNovelsVolumeChaptersResponse,
} from "./models";
import { fetchJSON, mainRateLimiter } from "./network";
import { SkyNovelsParser } from "./parser";
import SkyNovelsConfig from "./pbconfig";

export class SkyNovelsExtension implements ExtensionImpl<typeof SkyNovelsConfig> {
  private readonly parser = new SkyNovelsParser();

  async getSearchResults(
    query: SearchQuery<Metadata>,
    _metadata: Metadata | undefined,
    _sortingOption: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const title = query.title.trim();
    if (!title) {
      return { items: [] };
    }

    const primaryResults = await this.searchNovels(title);
    let mergedResults = primaryResults;

    if (!hasStrongSearchMatch(title, primaryResults)) {
      const fallbackTerm = title.split(/\s+/).find((token) => token.length >= 3);
      if (fallbackTerm && fallbackTerm.toLowerCase() !== title.toLowerCase()) {
        mergedResults = this.mergeNovelResults(primaryResults, await this.searchNovels(fallbackTerm));
      }
    }

    const sortedResults = [...mergedResults].sort((left, right) => {
      const scoreDifference = buildSearchScore(title, right) - buildSearchScore(title, left);
      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return left.nvl_title.localeCompare(right.nvl_title, "es", { sensitivity: "base" });
    });

    return {
      items: this.parser.parseSearchResults(sortedResults),
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const [baseResponse, genresResponse, statsResponse] = await Promise.all([
      fetchJSON<SkyNovelsNovelBaseResponse>(novelBaseApiUrl(mangaId)),
      fetchJSON<SkyNovelsGenresResponse>(novelGenresApiUrl(mangaId)),
      fetchJSON<SkyNovelsStatsResponse>(novelStatsApiUrl(mangaId)),
    ]);

    return this.parser.parseNovelDetails(
      mangaId,
      baseResponse.novel,
      genresResponse.genres ?? [],
      statsResponse,
    );
  }

  async getChapters(sourceManga: SourceManga, sinceDate?: Date): Promise<Chapter[]> {
    const volumesResponse = await fetchJSON<SkyNovelsVolumesResponse>(novelVolumesApiUrl(sourceManga.mangaId));
    const volumes = volumesResponse.volumes ?? [];
    if (volumes.length === 0) {
      return [];
    }

    const volumePages = await Promise.all(
      volumes.map(async (volume) => ({
        volume,
        chapters: (await fetchJSON<SkyNovelsVolumeChaptersResponse>(volumeChaptersApiUrl(sourceManga.mangaId, volume.id))).items ?? [],
      })),
    );

    const chapters = this.parser.parseChapters(sourceManga, volumePages);
    if (!sinceDate) {
      return chapters;
    }

    return chapters.filter((chapter) => !chapter.publishDate || chapter.publishDate > sinceDate);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const response = await fetchJSON<SkyNovelsChapterResponse>(chapterApiUrl(chapter.chapterId));
    return this.parser.parseChapterDetails(chapter, response.chapter);
  }

  async processTitlesForUpdates(updateManager: UpdateManager, _lastUpdateDate?: Date): Promise<void> {
    const latestChapterCounts = new Map<string, number | undefined>();

    for (const sourceManga of updateManager.getQueuedItems()) {
      try {
        if (!latestChapterCounts.has(sourceManga.mangaId)) {
          const stats = await fetchJSON<SkyNovelsStatsResponse>(novelStatsApiUrl(sourceManga.mangaId));
          latestChapterCounts.set(sourceManga.mangaId, stats.nvl_chapters);
        }

        const latestChapterCount = latestChapterCounts.get(sourceManga.mangaId);
        const knownChapterCount = sourceManga.chapterCount ?? (await updateManager.getNumberOfChapters(sourceManga.mangaId));

        if (latestChapterCount === undefined) {
          await updateManager.setUpdatePriority(sourceManga.mangaId, "high");
          continue;
        }

        await updateManager.setUpdatePriority(
          sourceManga.mangaId,
          latestChapterCount > knownChapterCount ? "high" : "skip",
        );
      } catch {
        await updateManager.setUpdatePriority(sourceManga.mangaId, "high");
      }
    }
  }

  async initialise(): Promise<void> {
    mainRateLimiter.registerInterceptor();
  }

  private async searchNovels(title: string): Promise<SkyNovelsNovelSummary[]> {
    const response = await fetchJSON<SkyNovelsSearchResponse>(searchApiUrl(title));
    return response.novels ?? [];
  }

  private mergeNovelResults(...resultSets: SkyNovelsNovelSummary[][]): SkyNovelsNovelSummary[] {
    const seenIds = new Set<number>();
    const mergedResults: SkyNovelsNovelSummary[] = [];

    for (const resultSet of resultSets) {
      for (const result of resultSet) {
        if (seenIds.has(result.id)) {
          continue;
        }

        seenIds.add(result.id);
        mergedResults.push(result);
      }
    }

    return mergedResults;
  }
}

export const SkyNovels = new SkyNovelsExtension();
