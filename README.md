# Agent Workbench

A portfolio project demonstrating agentic AI application engineering and edge-native platform infrastructure. It includes a streaming LLM chat interface built with Next.js and the Vercel AI SDK, backed by a separate AI gateway service instead of direct client-to-provider calls.

The goal is to show the engineering decisions behind an AI feature, not just the interface itself: auth boundaries, tool orchestration, and service-to-service request flow are all part of the design.

**Live app:** https://agent-workbench-web.alikhalili.workers.dev
**Gateway:** https://agent-workbench-gateway.alikhalili.workers.dev

## Architecture

**Request flow:**

```text
┌─────────┐ stream ┌────────────────────┐ Bearer ┌──────────────────────┐ stream ┌───────────┐
│ Browser │ ───────▶ │ Next.js Worker     │ token  │ AI Gateway Worker    │ ───────▶ │ Claude    │
│(useChat)│ ◀─────── │ apps/web           │ ───────▶ │ services/ai-gateway │ ◀──────▶ │ Sonnet 5  │
└─────────┘         │ /api/chat          │        │ /token · auth · tools│         │(Anthropic)│
                   └────────────────────┘        └──────────────────────┘         └───────────┘
                                              │
                            ┌─────────────────┴─────────────────┐
                            │ Weather (Open-Meteo) · Search  │
                            │ (Tavily) · Calculator (mathjs) │
                            └─────────────────────────────────┘
```

`apps/web` is a Next.js app deployed as a Cloudflare Worker via OpenNext. It owns the browser-facing UI and a thin `/api/chat` route that forwards requests to the gateway. It does not hold model-provider credentials.

`services/ai-gateway` is a separate Cloudflare Worker that sits between `apps/web` and Anthropic. It is intentionally structured as an auth-and-tool boundary rather than a simple pass-through proxy:

- **Machine-to-machine auth** — `apps/web` authenticates to the gateway using a client-credentials flow, exchanging `CLIENT_ID` and `CLIENT_SECRET` for a short-lived bearer token that is signed with a shared secret. The gateway verifies each request before doing any work.
- **Credential isolation** — the Anthropic and Tavily API keys live only in the gateway environment. They are not exposed to the browser or the web app runtime.
- **Rate limiting** — the gateway enforces a per-IP request limit using Cloudflare's native rate-limiting binding, rejecting excess requests with `429` before they ever reach the model or search provider.
- **Tool orchestration** — the gateway exposes server-side tools for weather, web search, and calculator-style evaluation. The AI SDK tool-calling loop allows Claude to call tools, read their output, and continue reasoning before producing a final answer.

## Tech Stack

- **Next.js 16** — App Router, TypeScript, Turbopack
- **Tailwind CSS 4**
- **Vercel AI SDK v5** — `useChat` on the client and `streamText` / `convertToModelMessages` on the server
- **Anthropic Claude Sonnet 5**
- **Zod** — input validation for tool schemas
- **mathjs** — safe expression evaluation for the calculator tool
- **Tavily** — web search API
- **Open-Meteo** — weather and geocoding data without an API key
- **pnpm** — monorepo package management
- **Cloudflare Workers** — both app and gateway are deployed as independent Workers

## Project Structure

```text
agent-workbench/
├── apps/
│   └── web/                     # Next.js app + thin gateway proxy
│       ├── src/app/
│       │   ├── page.tsx        # chat UI with message and tool-call states
│       │   └── api/chat/route.ts # forwards requests to the gateway
│       ├── src/lib/gateway-client.ts # token fetch + gateway forwarding
│       ├── wrangler.jsonc      # Worker config
│       └── open-next.config.ts
├── services/
│   └── ai-gateway/             # Cloudflare Worker: auth + model calls + tools
│       ├── src/index.ts        # /token endpoint + auth verification + streamText
│       └── src/lib/tools/
│           ├── weather.ts      # Open-Meteo geocoding + forecast
│           ├── web-search.ts   # Tavily search integration
│           └── calculator.ts   # mathjs-based evaluator
├── package.json                # pnpm workspace root
└── README.md
```

## Getting Started

**Prerequisites:** Node 20+, pnpm, an Anthropic API key, and a Tavily API key.

Run both services in parallel from separate terminals.

### 1. Install dependencies

```bash
git clone https://github.com/khaliliali/agent-workbench.git
cd agent-workbench
pnpm install
```

### 2. Configure the gateway

Create `services/ai-gateway/.dev.vars`:

```env
ANTHROPIC_API_KEY=sk-ant-...
TAVILY_API_KEY=tvly-...
CLIENT_ID=<generate with: node -e "console.log(require('crypto').randomUUID())">
CLIENT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
TOKEN_SIGNING_SECRET=<generate the same way as CLIENT_SECRET>
```

### 3. Configure the app

Create `apps/web/.env.local`:

```env
GATEWAY_URL=http://localhost:8787
GATEWAY_CLIENT_ID=<same value as CLIENT_ID above>
GATEWAY_CLIENT_SECRET=<same value as CLIENT_SECRET above>
```

### 4. Run the app and gateway

```bash
# Terminal 1
cd services/ai-gateway && wrangler dev

# Terminal 2
cd apps/web && pnpm dev
```

Open http://localhost:3000.

## Key Architectural Decisions

### Why a separate gateway worker?

Calling the provider directly from `apps/web` is simpler, but it collapses the credential boundary and the user-facing runtime. A separate gateway gives the project a place to enforce auth, manage upstream credentials, and shape a reusable service boundary. It is a deliberate platform pattern rather than just an extra hop.

### Why not use a general-purpose code executor?

The calculator tool is intentionally constrained. Running arbitrary model-generated code is a security problem even for large platforms — Check Point Research demonstrated a full sandbox escape against Cloudflare's own Code Mode product via prompt injection, presented at Black Hat USA 2026. A true sandbox is much harder to reason about than it appears. This project uses `mathjs` for expression evaluation and explicitly avoids presenting that as a general-purpose execution environment.

### Why Tavily?

Tavily is built for agent-style retrieval and returns cleaner, more LLM-friendly results than raw search-engine markup. It also has a lightweight free tier, which makes it suitable for a portfolio project without adding a billing-heavy setup.

## Retrieval-Augmented Generation (RAG)

The gateway can ground Claude's answers in private documents rather than general training knowledge.

## Evaluation

`evals/` contains an automated test suite that runs against the live deployed app, replacing manual spot-checking with a repeatable pass/fail report.

**Test cases** span three categories: RAG accuracy (does retrieval pull facts from the correct source document — verified using synthetic test documents with unique, unambiguous facts), tool-calling correctness, and negative cases (does the app correctly decline to answer rather than hallucinate when asked about content it doesn't have).

**Grading** uses LLM-as-judge as the primary method — a second Claude call evaluates whether a given answer satisfies what's expected — reserving exact substring matching for genuinely unambiguous cases (e.g. a specific codename). This is a deliberate choice: LLM output is rarely exact-string-predictable, and one of this project's own test cases (a correct calculator answer, "41,924" vs. an expected "41924") failed exact-match purely on formatting, despite the underlying answer being right — real evidence for why the industry has moved toward LLM-as-judge for this kind of evaluation.

Run it:

```bash
cd evals
export ANTHROPIC_API_KEY=<your key>
npx tsx run-evals.ts
```

**Known constraint:** grading calls hit the Anthropic API directly (not through the gateway), so eval runs consume separate quota from the app's own usage and are unaffected by the gateway's rate limiter or auth — appropriate for an internal tooling script, not user-facing traffic.

**Ingestion** — a local Node script (`services/ai-gateway/scripts/ingest.ts`) extracts text from PDF/DOCX files, splits it into ~500-word overlapping chunks, and sends each to a gateway `/ingest` endpoint (OAuth-protected, same client-credentials flow as chat). The endpoint embeds each chunk with Workers AI (`bge-base-en-v1.5`, 768 dimensions) and stores it in Cloudflare Vectorize alongside its source metadata.

**Retrieval** — on every chat message, the gateway embeds the user's question, queries Vectorize for the 3 closest chunks (cosine similarity), and passes them to Claude via `streamText`'s `system` parameter — instructed to cite which source file it drew from, so answers are independently verifiable rather than trusted blindly.

**Why Cloudflare Vectorize + Workers AI instead of a separate vector DB provider?** Both bindings live in the same account and Worker as everything else — no new API key, no new service to operate, consistent with the project's broader "consolidate on one platform" approach. The tradeoff: Vectorize and Workers AI have no local simulation (`wrangler dev` proxies these bindings to the real, remote service via `remote: true`), so local development for this feature always touches production infrastructure — a real constraint to be aware of, not a limitation this project works around.

**A note on retrieval accuracy:** RAG is a probabilistic improvement, not a guarantee. If a user's question is worded very differently from the source text, the relevant chunk may not rank in the top 3 and won't reach Claude at all. This project uses semantic (embedding-based) search only — no keyword fallback or re-ranking — which is a reasonable scope for a portfolio demonstration but a known gap versus a production RAG system.

## Known Limitations

- Distributed tracing between the web app and gateway was not implemented in this iteration.
- The calculator tool is intentionally not a general-purpose code executor.
- `CLIENT_ID` and `CLIENT_SECRET` are static shared credentials for this project setup; a production system would usually rotate and scope credentials per client.
- RAG retrieval is semantic-only (no keyword/hybrid search or re-ranking), so relevant content can be missed if a question's wording diverges significantly from the source text.

## Notes

This project is intended as a practical demonstration of AI app architecture and platform engineering, especially the boundary between user-facing app logic and upstream model/service access.
