import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { weatherTool } from '@/lib/tools/weather';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-5'),
    messages: await convertToModelMessages(messages),
    tools: {
      weather: weatherTool,
    },
    stopWhen: stepCountIs(5), // keep looping — call tools, read results, call more tools if needed
  });

  return result.toUIMessageStreamResponse();
}
