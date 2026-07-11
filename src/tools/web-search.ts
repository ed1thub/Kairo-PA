import type { z } from "zod";
import { tavily } from "@tavily/core";
import type { webSearchInputSchema } from "./schemas";

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
}

export async function webSearch({
  query,
  maxResults,
}: z.infer<typeof webSearchInputSchema>): Promise<{ results: WebSearchResult[]; answer?: string }> {
  "use step";
  const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
  const response = await client.search(query, { maxResults, includeAnswer: "basic" });

  return {
    answer: response.answer,
    results: response.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      publishedDate: r.publishedDate,
    })),
  };
}
