import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  tool,
  type UIMessage,
} from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { weatherTool } from '@/lib/tools/weather';
import { z } from 'zod';
import { webSearchTool } from '@/lib/tools/web-search';

const calculatorTool = tool({
  description:
    'Perform a basic math calculation. Use this for any arithmetic the user asks about.',
  inputSchema: z.object({
    expression: z
      .string()
      .describe(
        "A math expression to evaluate, e.g. '47 * 892' or '(12 + 8) / 4'",
      ),
  }),
});

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-5'),
    messages: await convertToModelMessages(messages),
    tools: {
      weather: weatherTool,
      calculator: calculatorTool,
      webSearch: webSearchTool,
    },
    stopWhen: stepCountIs(5), // keep looping — call tools, read results, call more tools if needed
  });

  return result.toUIMessageStreamResponse();
}
