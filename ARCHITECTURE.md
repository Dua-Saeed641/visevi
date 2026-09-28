# Architecture

> Status: **Planned** — nothing described here is implemented yet. This
> document records the current architectural direction so implementation
> stays consistent as it's built out. Revise this file when decisions change.

## Core Product Loop

VisEvi's processing pipeline follows one loop, applied to every piece of
uploaded media:

```
RAW MEDIA
    ↓
PRE-PROCESSING             (Cloudinary enhance/sharpen/auto-orient — keeps
    ↓                        blurry/motion field photos detectable)
MEDIA UNDERSTANDING        (Cloudinary AI add-ons + vision analysis)
    ↓
STRUCTURED OBSERVATIONS    (tags, labels, project/location/time metadata)
    ↓
VERIFICATION                (cross-cutting — see below: consistency check +
    ↓                        duplicate detection run against every observation)
TEMPORAL / VISUAL CHANGE   (before/after comparison + AI-described change)
    ↓
TRACEABLE EVIDENCE         (linked back to original Cloudinary asset + version)
    ↓
SEMANTIC SEARCH            (metadata + embedding-based discovery)
    ↓
VISUAL REPORT              (assembled summary, verified-activity counts,
                             impact-indicator mapping, campaign-ready export)
```

**Verification is drawn as a step in this loop for readability, but it's
really a cross-cutting concern**: it runs against every structured
observation (does detected content match claimed project/location/stage?)
and against the asset library as a whole (has this exact image appeared
before?), not just once per upload. See
[Verification & Trust Layer](#verification--trust-layer) below.

## System Components

```
┌────────────┐      ┌──────────────┐      ┌────────────────────┐
│   client   │◄────►│    server    │◄────►│     Cloudinary      │
│ (React SPA)│ REST │ (Node API)   │  SDK │ (storage, transform,│
└────────────┘      └──────┬───────┘      │  AI add-ons, search)│
                            │              └────────────────────┘
                            ▼
                     ┌──────────────┐      ┌────────────────────┐
                     │  PostgreSQL  │      │   LLM provider      │
                     │ (projects,   │      │ (report synthesis,  │
                     │  locations,  │◄────►│  embeddings for     │
                     │  evidence    │      │  semantic search)   │
                     │  metadata)   │      └────────────────────┘
                     └──────────────┘
```

- **client** — the web app users interact with: upload media, browse
  projects/locations/timelines, run searches, build and export reports.
- **server** — API layer. Orchestrates uploads to Cloudinary, triggers AI
  analysis, writes structured observations to Postgres, serves search and
  report-generation endpoints.
- **Cloudinary** — system of record for the media itself. Handles storage,
  delivery, transformations, and AI-assisted analysis (auto-tagging,
  captioning, content-aware operations). Every asset's `public_id` + version
  history is the traceability anchor referenced everywhere else in the system.
- **PostgreSQL** — system of record for *structured knowledge about* the
  media: projects, locations, timelines, AI-derived observations, user
  annotations, report definitions. Cloudinary stores the pixels; Postgres
  stores what the platform knows about them.
- **LLM provider** — used for three things: (1) generating embeddings for
  semantic search over media descriptions/observations, (2) synthesizing
  structured observations into narrative report text, (3) classifying a
  project's aggregated tags/activities against the impact-indicator mapping
  table (see below).

## Verification & Trust Layer

This is VisEvi's core differentiator (full rationale in
[REQUIREMENTS.md § Differentiator](REQUIREMENTS.md#differentiator-verified-evidence-not-just-organized-evidence)).
It is not a pipeline stage that runs once — it's a set of checks the server
runs against every structured observation and against the library as a
whole:

- **Consistency check** — compares an asset's AI-detected content against its
  claimed project/location/stage/date. Runs as part of the same server-side
  step that writes structured observations to Postgres. A mismatch sets a
  `verification_status` field (`verified` / `flagged`) rather than silently
  accepting the claim — this is what feeds the report's "N verified
  activities" count.
- **Duplicate/reuse detection** — perceptual hash (e.g. pHash) computed per
  asset on upload, checked against a hash index in Postgres. A near-duplicate
  hit is surfaced as a flag on both the new and prior asset, not silently
  deduplicated away — the evidence trail needs to show *that* a reuse was
  detected, not just hide it.
- **AI-described before/after change** — when two assets are compared, the
  vision/LLM pass doesn't just render them side by side; it's asked to
  describe *what changed* (e.g. coverage estimate, new/removed objects), and
  that description is stored alongside the comparison, traceable to both
  source assets.

All three write into the same `verification_status` / `change_description`
fields Postgres already needs for structured observations — no separate
service, just extra columns and one extra server-side step per upload.

## Impact Indicator Mapping

Second differentiator (full rationale in
[REQUIREMENTS.md § New/Unique Feature](REQUIREMENTS.md#newunique-feature-impact-indicator-auto-mapping)).
A small, curated lookup table (`tag/activity → SDG target code`) lives in
Postgres. When a project's report is generated, the server aggregates that
project's tags/activities and asks the LLM to classify them against the
table, producing a short list of supported indicators (e.g. "SDG 7.1"), each
linked back to the specific assets that back it. No new infrastructure —
one table plus one LLM call at report-generation time.

## Why Cloudinary Sits at the Center

The problem statement requires the platform be built *using Cloudinary*, and
several stated goals map directly onto Cloudinary capabilities rather than
custom infrastructure:

| Requirement (from problem statement)         | Cloudinary capability |
|-----------------------------------------------|------------------------|
| Analyze/organize large media collections       | Upload API, Media Library, structured metadata |
| Identify projects/activities/locations/signals | AI add-ons (auto-tagging, auto-captioning), Google Vision add-on |
| Reliable detection on poor-quality field photos | Transformation API pre-processing (`e_improve`, `e_sharpen`, auto-orient) before AI add-on analysis |
| Before/after comparison                         | Versioning, transformation API (overlays/diff rendering) |
| AI-powered metadata, tagging, semantic search   | Structured metadata, tags, Search API |
| Visual reports/campaign-ready content           | Transformation + delivery pipeline for report image assets |
| Traceability to original assets/transformations | `public_id`, asset versioning, derived-asset tracking |
| Verification (named in problem context, not in the six goals) | Structured metadata for `verification_status`, versioning as the audit trail for consistency/duplicate checks |

Custom services (Postgres, LLM) exist to add the relational/semantic layer on
top of Cloudinary's media layer — not to replace it.

## Planned Technology Stack

See README.md for the same list with setup instructions. Summary:

- **Frontend:** React + TypeScript + Vite, Tailwind CSS
- **Backend:** Node.js + TypeScript + Express
- **Database:** PostgreSQL (Prisma ORM)
- **Media platform:** Cloudinary (upload, transformations, AI add-ons, Search API)
- **AI/LLM:** Claude or OpenAI API for embeddings + report text generation
- **Semantic search:** metadata/tag search via Cloudinary Search API, optional
  vector similarity via `pgvector` for description-level semantic matching

These are the current best-fit choices given a short hackathon timeline
(fast to scaffold, strong Cloudinary SDK support, TypeScript end-to-end).
They are not mandated by the problem statement and can change.

## Repository Layout

```
VisEvi/
├── client/    # React frontend (to be scaffolded)
├── server/    # Node/Express API (to be scaffolded)
├── docs/      # architecture notes, diagrams, decisions
```

`client/` and `server/` are currently placeholders — see each directory's
README for what will go there.

## Open Architectural Questions

- Exact before/after comparison UX (side-by-side vs. slider vs. diff overlay)
  — affects whether we need custom image-diff rendering or can rely purely on
  Cloudinary transformation chaining.
- Whether semantic search needs a dedicated vector store or whether
  `pgvector` inside the existing Postgres instance is sufficient at hackathon
  scale (it is — no separate vector DB planned unless data volume demands it).
- Report export format(s): in-app visual page vs. downloadable PDF/image.
