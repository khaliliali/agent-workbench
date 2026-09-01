# Failure Induction 3: Rate Limiter Fails Under True Concurrency

**Date:** 2026-09-01
**Hypothesis tested:** Firing multiple requests from the same client simultaneously would trip the gateway's per-IP rate limit (5 requests per 60 seconds), and I'd observe the actual user-facing 429 behavior.

## What I did

Wrote a small script that fires 8 requests to the live gateway at the exact same time, using the same client identity, and recorded the status and timing of each.

## What I expected

Roughly the first 5 requests to succeed, and the remaining 3 to be rejected with a 429, since the configured limit is 5 requests per 60 seconds per IP.

## What actually happened

All 8 requests succeeded with a 200 status. None were rejected. Follow-up query against the metrics table confirmed the requests genuinely reached Claude and were billed — this wasn't a false positive from caching or a client-side retry masking the real result.

## What this tells me

The rate limiter has a race condition under real concurrency. The check-then-increment pattern it relies on isn't atomic against simultaneous requests: when 8 requests arrive at once, they can all read the current count before any of them has finished writing back an updated value, so every one of them sees "under the limit" and passes. The limiter works correctly for sequential traffic (which is what I tested when I originally built and verified it) but not for a genuine burst — which is exactly the scenario a rate limiter exists to protect against.

This matters because the realistic threat model for a public-facing endpoint isn't one person clicking send five times slowly — it's a script, a buggy retry loop, or a deliberate burst, all of which are inherently concurrent.

## What I changed

Nothing yet — documenting as a known, unmitigated gap rather than claiming a fix I haven't verified. A real fix would need to be tested the same way this failure was found: by firing genuine concurrent load at it, not by re-reading the rate limiter's own documentation and assuming correctness. Worth investigating whether the underlying rate-limiting primitive has stronger atomicity guarantees than I'm currently using correctly, or whether a different mechanism (e.g. a counter enforced through a single point of coordination) is required for correctness under burst conditions.

## Cost of this test

Eight requests, roughly $0.03 each — about $0.24 to discover that the protection I built and believed was working had never actually been tested under the load pattern it was designed for.
