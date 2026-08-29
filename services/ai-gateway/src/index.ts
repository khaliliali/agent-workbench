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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/token') {
      return handleTokenRequest(request, env);
    }
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !(await verifyToken(token, env.TOKEN_SIGNING_SECRET))) {
      return new Response('Unauthorized', { status: 401 });
    }

    const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const { messages }: { messages: UIMessage[] } = await request.json();

    const result = streamText({
      model: anthropic('claude-sonnet-5'),
      messages: await convertToModelMessages(messages),
      tools: {
        weather: weatherTool,
        calculator: calculatorTool,
        webSearch: createWebSearchTool(env.TAVILY_API_KEY),
      },
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse();
  },
};
