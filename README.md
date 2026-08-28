# Agent Workbench

A portfolio project demonstrating agentic AI application engineering and edge-native platform infrastructure: a streaming LLM chat interface built on Next.js and the Vercel AI SDK, backed by a purpose-built AI gateway service rather than a direct client-to-provider call. It exists to show the engineering judgment behind an AI feature, not just the feature itself — service-to-service auth, distributed tracing, and rate limiting sit alongside the model integration, the same way they would in a production system.

Built by a Senior Frontend/Platform Engineer moving from Angular into React/Next.js, targeting AI Engineer, LLM Engineer, and Forward-Deployed Engineer roles.

## Architecture

**Target request flow:**

```
┌─────────┐  stream   ┌────────────────────┐  stream   ┌──────────────────────┐  stream   ┌───────────┐
│ Browser │ ────────▶ │  Next.js Worker     │ ────────▶ │  AI Gateway Worker    │ ────────▶ │  Claude   │
│(useChat)│ ◀──────── │  apps/web           │ ◀──────── │  services/ai-gateway  │ ◀──────── │  Sonnet 5 │
└─────────┘           │  /api/chat          │           │  M2M auth · tracing · │           │(Anthropic)│
                       └────────────────────┘           │  rate limiting        │           └───────────┘
                                                          └──────────────────────┘
```

`apps/web` is a Next.js app deployed as a Cloudflare Worker (via OpenNext). It owns the browser-facing UI and the `/api/chat` route, which streams `useChat`-compatible responses. `services/ai-gateway` is a second, independently deployed Cloudflare Worker that sits between `apps/web` and Anthropic. It is a deliberate architectural boundary, not a thin pass-through proxy:

- **Credential isolation** — the Anthropic API key lives only in the gateway's environment. The Next.js Worker never holds a provider credential; it authenticates to the gateway with its own machine-to-machine OAuth client.
- **Distributed tracing** — requests carry a trace ID from the browser through both Workers to the model call and back, so a slow or failed generation can be attributed to a specific hop instead of treated as one opaque round trip.
- **Rate limiting** — enforced at the gateway, in front of the provider, independent of anything the Next.js app does — the same shape a platform team would put in front of any shared upstream, LLM or otherwise.

`packages/shared` holds the zod schemas used on both sides of that boundary (request/response contracts for the gateway API), so `apps/web` and `services/ai-gateway` validate against the same types instead of duplicating them.

**Current state:** `services/ai-gateway` and `packages/shared` are scaffolded directories, not yet implemented. Today, `apps/web/api/chat` calls the Anthropic API directly via `@ai-sdk/anthropic`. The diagram above is the target architecture this project is being built toward — see [Status](#status--roadmap).

## Tech Stack

- **Next.js 16** — App Router, TypeScript, Turbopack
- **Tailwind CSS 4**
- **Vercel AI SDK v5** — `useChat` on the client, `streamText` and `convertToModelMessages` on the server; tool calling planned
- **Anthropic Claude Sonnet 5** — model provider
- **Zod** — schema validation, shared across app and gateway
- **pnpm** — monorepo package management
- **Cloudflare Workers** (via OpenNext) — deployment target for both the app and the gateway, not Cloudflare Pages

## Project Structure

```
agent-workbench/
├── apps/
│   └── web/                 # Next.js app — chat UI + /api/chat route
│       └── src/app/
│           ├── page.tsx           # useChat-based chat UI
│           └── api/chat/route.ts  # streamText + convertToModelMessages
├── services/
│   └── ai-gateway/          # Cloudflare Worker AI gateway (scaffolded, not yet implemented)
├── packages/
│   └── shared/               # zod schemas shared between apps/web and services/ai-gateway (scaffolded, not yet implemented)
└── package.json
```

## Getting Started

**Prerequisites:** Node 20+, pnpm (pinned via `packageManager` at `pnpm@11.20.0`), and an Anthropic API key.

```bash
git clone https://github.com/khaliliali/agent-workbench.git
cd agent-workbench/apps/web
pnpm install
```

Create `apps/web/.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Run the dev server:

```bash
pnpm dev
```

The app runs at `http://localhost:3000`. Note the app currently calls Anthropic directly with this key — once `services/ai-gateway` is implemented, the credential moves there and `apps/web` authenticates to the gateway instead (see Architecture above).

## Status / Roadmap

**Implemented**
- Next.js 16 app scaffold (App Router, TypeScript, Tailwind CSS 4)
- `/api/chat` route: `streamText` + `convertToModelMessages`, calling Claude Sonnet 5 directly
- Browser chat UI using `useChat`, streaming responses in real time

**Planned**
- `services/ai-gateway`: Cloudflare Worker AI gateway with M2M OAuth, distributed tracing, and rate limiting, sitting between `apps/web` and Anthropic
- `packages/shared`: zod schemas shared between `apps/web` and `services/ai-gateway`
- Tool calling: web search, weather, calculator, sandboxed code execution
- Deployment of both Workers to Cloudflare via OpenNext

## Key Architectural Decisions

**Why a separate gateway Worker instead of calling Anthropic directly from the Next.js route?**

Calling the provider directly from `apps/web` is simpler and is what the code does today. It doesn't scale to more than one client, doesn't give you a place to enforce rate limits independent of the frontend, and puts the provider credential in the same runtime as user-facing request handling. Splitting the gateway into its own Worker means:

- The credential boundary matches the trust boundary — only the gateway needs to know how to talk to Anthropic.
- Cross-cutting concerns (auth, tracing, rate limiting) live in one place and apply to any future caller of the gateway, not just this one Next.js app.
- The two services can be deployed, scaled, and reasoned about independently, which is the pattern this project is meant to demonstrate for platform/FDE-style roles — not just "an app that calls an LLM."

The tradeoff is an extra network hop and a second service to operate for what is, right now, a single-client chat app. That tradeoff is the point: it's the same one a platform team makes when they put a gateway in front of a shared upstream, made deliberately here rather than deferred.
