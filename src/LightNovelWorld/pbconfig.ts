import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";

export default {
  name: "LightNovelWorld",
  description: "Paperback 0.9 source for lightnovelworld.org with cached novel chapter lists.",
  version: "0.2.0",
  icon: "icon.svg",
  language: "en",
  contentRating: ContentRating.MATURE,
  capabilities: [SourceIntents.SEARCH_RESULT_PROVIDING, SourceIntents.CHAPTER_PROVIDING],
  badges: [
    {
      label: "Novel",
      textColor: "#ffffff",
      backgroundColor: "#3b82f6",
    },
  ],
  developers: [
    {
      name: "OpenCode",
    },
  ],
} satisfies ExtensionInfo;
