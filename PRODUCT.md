# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone managing complex, multi-provider medical records over time (family members, patients managing chronic illness, independent care managers, clinicians) who needs a synthesized medical timeline rather than an unverified, stateless AI summary.

## Product Purpose

CareNote turns fragmented medical PDFs into a persistent patient graph with appointment-ready briefings where every single assertion is directly verifiable against the original source document.

## Positioning

Two concrete technical bets that separate CareNote from generic chat wrappers and vector search tools:

1. **Graph Memory Instead of Vector Search:** Standard RAG tools chop PDFs into isolated text chunks in a vector database: losing the concept of time, doctor relationships, and changing dosages. CareNote models the patient's medical history as an evolving knowledge graph where entities (medications, conditions, labs, providers) connect across time.
2. **The PaperTrail:** AI summaries are dangerous in medicine without verification. CareNote embeds interactive source anchors for every factual claim, linking directly to the exact page and excerpt of the original medical PDF.

## Operating Context

- Input: Real clinical PDFs (discharge summaries, outpatient encounter notes, multi-column lab panels, prescriptions).
- Output: Appointment-ready clinical briefings and conversational query answers with clickable source anchors.
- Interaction: Split-screen clinical workspace where clicking a citation in the briefing instantly navigates the PDF viewer to the cited page.

## Capabilities and Constraints

- **Visual Extraction:** Ingests PDFs visually without fragile OCR templates.
- **Persistent Graph Memory:** Stores medical records as connected entities across encounters rather than stateless one-off chat prompts.
- **PaperTrail Verification:** Every claim in the generated briefing or query answer is anchored to a document ID, page number, and quote.
- **Honest Foundation:** Currently in its core foundational phase. It focuses purely on graph memory and verifiable claim provenance rather than bloated enterprise feature sets.

## Product Principles

1. **Graph Over Chunks:** Medical history is an interconnected, time-evolving graph, not random 500-token vector fragments.
2. **Zero Blind Trust:** If an AI makes a clinical claim, it must prove it with a page number and quote.
3. **No Fluff:** No fake statistics, no stock quotes, no academic enum theater. Show the real mechanism.
