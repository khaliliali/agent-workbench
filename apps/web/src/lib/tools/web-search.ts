import { tool } from 'ai';
import { z } from 'zod';

async function searchWeb(query: string) {
  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query: query,
      max_results: 5,
    }),
  });
  const data = await resp.json();
  return data.results;
}

export const webSearchTool = tool({
  description:
    "Search the web for current information. Use this for questions about recent events, facts you're unsure about, or anything that requires up-to-date information beyond your training data.",
  inputSchema: z.object({
    query: z.string().describe('The search query'),
  }),
  execute: async ({ query }) => {
    const results = await searchWeb(query);
    return results.map(
      (result: { title: string; url: string; content: string }) => ({
        title: result.title,
        url: result.url,
        snippet: result.content.slice(0, 300),
      }),
    );
  },
});
