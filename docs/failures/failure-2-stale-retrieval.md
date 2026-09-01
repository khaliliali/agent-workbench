# Failure Induction 2: Retrieval From Stale, Unmanaged Vector Data

**Date:** 2026-09-01
**Original hypothesis:** A deliberately ambiguous query would cause the vector search to return plausible-but-irrelevant chunks from one of two known test documents (Nimbus Freight or Copper Fig Bakery), and Claude would answer confidently using the wrong one.

## What I did

Asked a deliberately vague question with no company name or topic anchor: **"What's the third one they added, and why did it break the pattern?"** — designed to loosely match Copper Fig Bakery's oven chapter ("a third oven was later added... breaking the naming pattern").

As a control, I also asked a specific, unambiguous question: **"Tell me about the founder's motto"** — expected to retrieve cleanly from Nimbus Freight, the only document with founder content.

## What I expected

The vague query to pull the _wrong test document's_ chunks (bakery content instead of logistics, or vice versa) and answer confidently using them. The control query to retrieve correctly.

## What actually happened

**The control query worked exactly as expected** — correct source, correct facts, correctly cited.

**The vague query surfaced a different, more significant problem.** Claude answered in detail, fully confidently, citing `documents/The-Complete-Guide-to-Building-Skill-for-Claude.pdf` — a real, unrelated document I had ingested early on while building the RAG pipeline and never removed. My Vectorize index currently contains chunks from three documents, not the two I was treating as the active test set. The vague query matched content from this stale, forgotten source, and the system had no way to distinguish it from live, intended content.

## What this tells me

This is a more realistic and more damaging failure mode than the one I set out to test. A production RAG system's vector store accumulates data over its lifetime — old document versions, deleted or superseded content, test/scratch data — and **nothing in a basic ingest-and-query pipeline prevents stale entries from being retrieved and presented as authoritative.** The failure is invisible until a query happens to match old content; there is no warning, no confidence penalty, no staleness signal.

This maps directly to the "authorisation problem disguised as retrieval" framing: the missing control here isn't really about search relevance, it's about **document lifecycle management** — knowing what's actually supposed to be in the index right now, versus what's merely still physically present in it.

## What I changed

Nothing in the pipeline yet — documenting as a known, unmitigated gap. A production system would need at minimum: a `document_id`/version field in metadata, an explicit "active" vs "archived" flag checked at query time, and a deletion/re-indexing workflow when source documents change. None of this exists in the current `/ingest` endpoint, which only ever adds.

## Cost of this test

Two requests, ~$0.03 total — cheap to discover that vector store lifecycle management, not query phrasing, is the real production risk in this pipeline's current form.
