# Architecture

> Status: **Partially implemented.** Media pipeline (upload, pre-processing,
> AI Vision analysis) and the MongoDB evidence store are implemented and
> verified end-to-end (M1–M2). Verification checks, indicator mapping, and
> semantic search below are still planned (M5–M7). This document records the
> architectural direction so implementation stays consistent as it's built
> out — revise it when decisions change.

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
                     │   MongoDB    │      │   LLM provider      │
                     │ (projects,   │      │ (report synthesis,  │
                     │  locations,  │◄────►│  embeddings for     │
                     │  evidence    │      │  semantic search)   │
                     │  metadata)   │      └────────────────────┘
                     └──────────────┘
```

- **client** — the web app users interact with: upload media, browse
  projects/locations/timelines, run searches, build and export reports.
- **server** — API layer. Orchestrates uploads to Cloudinary, triggers AI
  analysis, writes structured observations to MongoDB, serves search and
  report-generation endpoints.
- **Cloudinary** — system of record for the media itself. Handles storage,
  delivery, transformations, and AI-assisted analysis (auto-tagging,
  captioning, content-aware operations). Every asset's `public_id` + version
  history is the traceability anchor referenced everywhere else in the system.
- **MongoDB (Atlas)** — system of record for *structured knowledge about*
  the media: projects, locations, timelines, AI-derived observations, user
  annotations, report definitions. Cloudinary stores the pixels; MongoDB
  stores what the platform knows about them. Accessed via the official
  `mongodb` Node.js driver directly — no ORM. Three collections
  (`projects`, `locations`, `assets`), kept normalized by reference rather
  than embedded, since projects/locations need independent upsert-by-name
  semantics; see server/src/lib/models.ts for the documented shape and
  server/README.md for why this isn't "a relational schema forced into
  Mongo."
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
  step that writes structured observations to MongoDB. A mismatch sets the
  asset's `verificationStatus` field (`UNVERIFIED` / `VERIFIED` / `FLAGGED`
  — already in the schema, not yet populated by a real check) rather than
  silently accepting the claim — this is what feeds the report's "N verified
  activities" count.
- **Duplicate/reuse detection** — perceptual hash (e.g. pHash) computed per
  asset on upload, checked against an indexed `perceptualHash` field across
  the `assets` collection (index already created in `lib/mongo.ts`). A
  near-duplicate hit is surfaced as a flag on both the new and prior asset,
  not silently deduplicated away — the evidence trail needs to show *that* a
  reuse was detected, not just hide it.
- **AI-described before/after change** — when two assets are compared, the
  vision/LLM pass doesn't just render them side by side; it's asked to
  describe *what changed* (e.g. coverage estimate, new/removed objects), and
  that description is stored alongside the comparison, traceable to both
  source assets.

All three write into fields the `Asset` document already has (see
`server/src/lib/models.ts`) — no separate service, just population logic and
one extra server-side step per upload.

## Sensor-Triggered Disaster Watch

Implemented in `server/src/routes/signals.ts`, `lib/weather.ts` and
`lib/hazards.ts`; UI in `client/src/pages/Watch.tsx`.

- **Monitored site** = a `locations` document with `lat`/`lng` (set at upload,
  via `PUT /api/signals/sites/:id`, or `npm run seed:sites`).
- **Signal intake**: three ways in, all through `recordReading()`. The timer
  (`SENSOR_POLL_MINUTES`) and `POST /poll` call `fetchCurrentWeather` (Google
  Maps Platform Weather API `currentConditions:lookup`, falling back to
  Open-Meteo; the stored `source` is whichever provider actually answered), and
  `POST /ingest` accepts a sensor or the demo simulator.
- **Rules**: `evaluateTemperature(tempC, lat)` in `lib/hazards.ts`: named
  thresholds per hazard and severity, gated to `|lat| <= 38`.
- **Alerts**: collection `alerts`; at most one non-resolved alert per site and
  hazard. A repeat breach updates it (peak, latest, count); a more severe one
  escalates it and re-opens an acknowledged alert.
- **Assessment**: `GET /api/signals/alerts/:id` computes on read from the
  site's assets, so new uploads change it immediately: `describeChange`
  (the existing comparison engine) on first vs latest capture, `corroborate`
  (lexicon match of AI observations to the hazard), evidence age, priority, the
  checklist, and `evidenceBoardUrl` (Cloudinary composite URL).
- **Collections added:** `readings` (history) and `alerts`.

## Impact Indicator Mapping

Second differentiator (full rationale in
[REQUIREMENTS.md § New/Unique Feature](REQUIREMENTS.md#newunique-feature-impact-indicator-auto-mapping)).
A small, curated lookup table (`tag/activity → SDG target code`) lives in
MongoDB. When a project's report is generated, the server aggregates that
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
| Identify projects/activities/locations/signals | AI Vision (Analyze API `ai_vision_general`) — implemented in `server/src/lib/cloudinary.ts`, blocked on the add-on being enabled on the account; see server/README.md |
| Reliable detection on poor-quality field photos | Transformation API pre-processing (`e_improve`, `e_sharpen`, auto-orient) before AI add-on analysis |
| Before/after comparison                         | Versioning, transformation API (overlays/diff rendering) |
| AI-powered metadata, tagging, semantic search   | Structured metadata, tags, Search API |
| Visual reports/campaign-ready content           | Transformation + delivery pipeline for report image assets |
| Traceability to original assets/transformations | `public_id`, asset versioning, derived-asset tracking |
| Verification (named in problem context, not in the six goals) | Structured metadata for `verification_status`, versioning as the audit trail for consistency/duplicate checks |

Custom services (MongoDB, LLM) exist to add the relational/semantic layer on
top of Cloudinary's media layer — not to replace it.

## Technology Stack

See README.md for the same list with setup instructions. Summary:

- **Frontend:** React + TypeScript + Vite, Tailwind CSS — implemented (M1)
- **Backend:** Node.js + TypeScript + Express — implemented (M1)
- **Database:** MongoDB Atlas, official `mongodb` driver, no ORM — implemented (M2)
- **Media platform:** Cloudinary (upload, transformations, AI Vision analysis) — implemented (M1–M2)
- **AI/LLM:** none yet — deliberately deferred to M6 (indicator classification)
  and M7 (embeddings); not needed for M1–M4
- **Semantic search:** deferred to M7 — MongoDB Atlas Vector Search, no
  separate vector database

## Repository Layout

```
VisEvi/
├── client/    # React frontend — implemented
├── server/    # Node/Express API — implemented (M1–M2)
├── docs/      # architecture notes, diagrams, decisions
```

See each directory's README for setup and structure.

## Open Architectural Questions

- Exact before/after comparison UX (side-by-side vs. slider vs. diff overlay)
  — affects whether we need custom image-diff rendering or can rely purely on
  Cloudinary transformation chaining.
- Whether MongoDB Atlas Vector Search is sufficient at hackathon scale for
  M7 (it should be — no separate vector DB planned unless data volume
  demands it).
- Report export format(s): in-app visual page vs. downloadable PDF/image.
- Which Cloudinary AI add-on to actually enable for M2 to produce real
  observations — see server/README.md § Notes on the Cloudinary AI Vision
  call; currently blocked on account-level add-on subscription.
