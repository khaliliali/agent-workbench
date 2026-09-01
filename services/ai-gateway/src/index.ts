import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { weatherTool } from '@/lib/tools/weather';
import { calculatorTool } from '@/lib/tools/calculator';
import { createWebSearchTool } from '@/lib/tools/web-search';

interface Env {
  ANTHROPIC_API_KEY: string;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  TOKEN_SIGNING_SECRET: string;
  TAVILY_API_KEY: string;
  CHAT_RATE_LIMITER: {
    limit: (options: { key: string }) => Promise<{ success: boolean }>;
  };
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  agent_workbench_metrics: D1Database;
}

async function createToken(signatureSecret: string): Promise<string> {
  const payload = JSON.stringify({ exp: Date.now() + 300_000 });
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signatureSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload),
  );
  const signature = btoa(
    String.fromCharCode(...new Uint8Array(signatureBuffer)),
  );
  return `${btoa(payload)}.${signature}`;
}

async function verifyToken(
  token: string,
  signingSecret: string,
): Promise<boolean> {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return false;

  const payload = JSON.parse(atob(encodedPayload));
  if (payload.exp < Date.now()) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expectedSignatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(atob(encodedPayload)),
  );
  const expectedSignature = btoa(
    String.fromCharCode(...new Uint8Array(expectedSignatureBuffer)),
  );

  return signature === expectedSignature;
}

async function handleTokenRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const { clientId, clientSecret } = (await request.json()) as {
    clientId: string;
    clientSecret: string;
  };
  if (clientId !== env.CLIENT_ID || clientSecret !== env.CLIENT_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const token = await createToken(env.TOKEN_SIGNING_SECRET);

  return new Response(
    JSON.stringify({ access_token: token, expires_in: 300 }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

async function handleIngestRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token || !(await verifyToken(token, env.TOKEN_SIGNING_SECRET))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { text, source, chunkIndex } = (await request.json()) as {
    text: string;
    source: string;
    chunkIndex: number;
  };

  const embeddingResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [text],
  });
  const embedding = embeddingResponse.data[0];

  const id = `${source}-${chunkIndex}`;

  await env.VECTORIZE.upsert([
    {
      id,
      values: embedding,
      metadata: { text, source, chunkIndex },
    },
  ]);

  return new Response(JSON.stringify({ success: true, id }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function retrieveContext(query: string, env: Env): Promise<string> {
  const embeddingResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [query],
  });
  const queryEmbedding = embeddingResponse.data[0];

  const results = await env.VECTORIZE.query(queryEmbedding, {
    topK: 3,
    returnMetadata: true,
  });

  if (results.matches.length === 0) return '';

  const contextChunks = results.matches
    .map(
      (match) => `[Source: ${match.metadata?.source}]\n${match.metadata?.text}`,
    )
    .join('\n\n');

  return `Relevant context from documents:\n\n${contextChunks}\n\nWhen you use information from the context above to answer, explicitly say which source file it came from.`;
}

async function logMetrics(
  env: Env,
  inputTokens: number,
  outputTokens: number,
  toolCalls: string[],
  finishReason: string,
) {
  const inputCost = (inputTokens / 1_000_000) * 3;
  const outputCost = (outputTokens / 1_000_000) * 15;
  const totalCost = inputCost + outputCost;

  await env.agent_workbench_metrics
    .prepare(
      `INSERT INTO request_metrics (timestamp, input_tokens, output_tokens, cost_usd, tool_calls, finish_reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      new Date().toISOString(),
      inputTokens,
      outputTokens,
      totalCost,
      toolCalls.join(',') || null,
      finishReason,
    )
    .run();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ingest') {
      return handleIngestRequest(request, env);
    }

    if (url.pathname === '/token') {
      return handleTokenRequest(request, env);
    }

    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await env.CHAT_RATE_LIMITER.limit({ key: ip });

    if (!success) {
      return new Response('Too many requests, please slow down', {
        status: 429,
      });
    }

    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !(await verifyToken(token, env.TOKEN_SIGNING_SECRET))) {
      return new Response('Unauthorized', { status: 401 });
    }

    const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const { messages }: { messages: UIMessage[] } = await request.json();

    const lastUserMessage = messages[messages.length - 1];
    const lastUserText =
      lastUserMessage.parts.find((p) => p.type === 'text')?.text ?? '';

    const context = await retrieveContext(lastUserText, env);

    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
      model: anthropic('claude-sonnet-5'),
      system: context || undefined,
      messages: modelMessages,
      tools: {
        weather: weatherTool,
        calculator: calculatorTool,
        webSearch: createWebSearchTool(env.TAVILY_API_KEY),
      },
      stopWhen: stepCountIs(5),
      onFinish: async ({ usage, finishReason, steps }) => {
        const toolCalls = steps
          .flatMap((step) => step.toolCalls ?? [])
          .map((call) => call.toolName);
        await logMetrics(
          env,
          usage.inputTokens ?? 0,
          usage.outputTokens ?? 0,
          toolCalls,
          finishReason,
        );
      },
    });

    return result.toUIMessageStreamResponse();
  },
};
