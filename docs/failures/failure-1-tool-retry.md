# Failure Induction 1: Tool Failure Modes — Retry Behavior and Silent Corruption

**Date:** 2026-09-01
**Original hypothesis:** A failing tool would cause the agent to retry repeatedly, burning tokens/cost before the `stopWhen: stepCountIs(5)` guard intervened.

## Test 1 — Hard failure (thrown error)

Modified `weatherTool` to unconditionally throw `Error("Weather service temporarily unavailable")`. Asked: "What's the weather in Tokyo?"

**Result:** Claude called the tool once, received the error, and gave a graceful fallback response offering an alternative (web search). No retry. `finish_reason: stop`, 10,056 input / 123 output tokens, $0.032.

**Finding:** No retry loop occurred. The `stopWhen` step cap was not exercised — it remains defense-in-depth for failure shapes this test didn't produce.

## Test 2 — Obviously invalid data (sentinel values)

Modified the tool to return `{ temperature: -999, windSpeed: -999, weatherCode: 9999 }` instead of throwing. Asked the same question.

**Result:** Claude recognized the values as implausible/placeholder and refused to report them as real, again offering an alternative.

**Finding:** The model has some resilience to obviously-fake data, likely from general training on data-quality patterns — not something this project's code enforces.

## Test 3 — Plausible-but-wrong data (silent corruption)

Modified the tool to return `{ temperature: 15, windSpeed: 8, weatherCode: 1 }` for Kuala Lumpur — a normal-looking value, but incorrect (actual conditions were meaningfully warmer).

**Result:** Claude reported "15°C, mainly clear" as fact, with full confidence, identical formatting to a genuinely correct answer. No hedging, no indication anything was uncertain.

**This is the real finding.** Unlike Tests 1 and 2, there is no mechanism — in the model or in this project's code — that can catch plausible-but-wrong tool output. The failure is invisible at every layer: the tool call succeeds, the data is well-typed and in-range, and the model has no independent way to verify it against reality.

## What I changed

Nothing yet — this is a genuine, unmitigated gap. A production system would need **source verification** (e.g. cross-checking against a second provider for high-stakes data) or **explicit uncertainty signaling** from tools themselves (a confidence/freshness field the model is instructed to weigh) — neither of which this project currently implements. Documenting as a known limitation rather than a false claim of resolution.

## Cost of testing

Three requests, roughly $0.03 each (~$0.09 total) — cheap to discover that the actual production risk isn't loop-driven cost blowup, but silent, undetectable data corruption.
