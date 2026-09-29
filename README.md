# VisEvi — Visual Evidence Intelligence

VisEvi turns unstructured project photos and videos into traceable,
searchable evidence of activities, changes, and project progress.

Built for the Geek Room hackathon, Problem Statement 02 · Cloudinary —
*AI-Powered Impact & Sustainability Media Platform*. See
[PROBLEM_STATEMENT.md](PROBLEM_STATEMENT.md) for the original brief.

## The Problem

NGOs, governments, and sustainability organizations generate large volumes of
field photos and video from projects, environmental initiatives,
infrastructure work, and community programs. Manually organizing, analyzing,
verifying, and turning that media into evidence and reports doesn't scale.

## Core Concept

> Turn unstructured project images and videos into traceable, searchable
> evidence of activities, changes, and project progress.

## Why Visual Evidence Matters

Photos and video are the most credible record a field team can produce — but
only if they can be trusted, found, and compared. A photo with no metadata,
no location, and no link back to its source is just a file. VisEvi's job is
to turn that file into **evidence**: something tied to a project, a place, a
point in time, and traceable back to the original asset — so it can support a
funding report, a compliance check, or a public impact story.

## Primary Workflow

```
RAW MEDIA
    ↓
PRE-PROCESSING             enhance/sharpen blurry or motion field photos
    ↓
MEDIA UNDERSTANDING        AI reads the media: objects, scene, activity
    ↓
STRUCTURED OBSERVATIONS    tags/labels become queryable project data
    ↓
VERIFICATION               consistency + duplicate checks (see below)
    ↓
TEMPORAL / VISUAL CHANGE   before/after comparison + AI-described change
    ↓
TRACEABLE EVIDENCE         every observation links back to its source asset
    ↓
SEMANTIC SEARCH            find media by meaning, not just filename/tag
    ↓
VISUAL REPORT              campaign-ready summary + verified-activity counts
                            + impact-indicator mapping
```

## Core Capabilities (Target)

- **Intelligent media organization** — analyze and organize large image/video
  collections automatically.
- **Signal identification** — detect projects, activities, locations, and
  visual signals present in the media.
- **Before/after comparison** — demonstrate visible project or environmental
  change over time, with an AI-generated description of what changed.
- **AI-powered search** — metadata, tagging, and semantic discovery across the
  whole media library.
- **Visual reporting** — generate reports, summaries, and campaign-ready
  content from collected evidence.
- **Traceability** — every derived asset or report item stays linked to its
  original source asset and transformation history.

## What Makes VisEvi Different

The problem statement names three pain points — organizing, analyzing,
**verifying** — but most teams will only build the first two. VisEvi treats
verification as a first-class feature, not an afterthought:

- **Consistency check** — AI-detected content is checked against what an
  asset is claimed to show (project/location/stage/date); mismatches are
  flagged, not silently trusted.
- **Duplicate/reuse detection** — perceptual hashing catches a photo reused
  across projects or reporting periods.
- **Robust detection on real field photos** — a Cloudinary pre-processing
  pass keeps AI detection accurate on typical blurry/motion phone shots.
- **Impact indicator mapping** — a project's evidence is automatically
  classified against recognized frameworks (starting with UN SDG targets),
  turning "we installed solar panels" into "this evidence supports SDG 7.1
  and SDG 13.2," traceable back to the exact assets behind each claim.

Full rationale: [REQUIREMENTS.md § Differentiator](REQUIREMENTS.md#differentiator-verified-evidence-not-just-organized-evidence)
and [§ New/Unique Feature](REQUIREMENTS.md#newunique-feature-impact-indicator-auto-mapping).

## How Cloudinary Fits

Cloudinary is the media backbone of VisEvi, not a bolt-on:

- **Storage & delivery** of all raw and transformed media.
- **AI add-ons** (auto-tagging, auto-captioning, vision analysis) power the
  "media understanding" stage of the core loop.
- **Versioning & transformation history** are what make traceability possible
  — every report image or comparison view can be traced to its Cloudinary
  `public_id` and version.
- **Search API** and structured metadata back the platform's search features.
- **Transformation pipeline** renders before/after comparisons and
  campaign-ready report assets on demand rather than as one-off exports.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full component breakdown and
how Cloudinary capabilities map to problem statement requirements.

## High-Level Architecture

```
client (React)  ⇄  server (Node/Express)  ⇄  Cloudinary (media + AI Vision)
                          │
                          ⇄  MongoDB Atlas (projects, locations, evidence)
                          ⇄  LLM provider (M6+: indicator classification,
                                            embeddings, report synthesis)
```

Full detail: [ARCHITECTURE.md](ARCHITECTURE.md).

## Technology Stack

| Layer | Choice | Status |
|---|---|---|
| Frontend | React + TypeScript + Vite, Tailwind CSS | Implemented |
| Backend | Node.js + TypeScript + Express | Implemented |
| Database | MongoDB Atlas, official `mongodb` driver (no ORM) | Implemented |
| Media platform | Cloudinary (upload, incoming transformations, AI Vision analysis, resized delivery); capture dates are read from the original file's EXIF locally | Implemented |
| Reasoning (verification, indicators, change narrative) | Deterministic server code over a concept lexicon — explainable, no external LLM | Implemented |
| Search | Concept-aware ranked search (TF-IDF + lexicon query expansion); not embeddings | Implemented |
| Perceptual hashing | `sharp` 64-bit dHash | Implemented |

## Local Development Setup

```bash
# clone and enter the repo
git clone <repo-url> && cd VisEvi

# copy environment variables and fill in real values — a MongoDB Atlas
# connection string and Cloudinary credentials are both required
cp .env.example .env

# backend
cd server && npm install && npm run dev

# frontend (separate terminal)
cd client && npm install && npm run dev
cp client/.env.example client/.env.local
```

## Environment Variables

See [.env.example](.env.example) for the full list. At minimum, expect to
configure:

- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `DATABASE_URL` — a MongoDB Atlas connection string, database name included
  in the path (e.g. `mongodb+srv://user:pass@cluster.mongodb.net/visevi`)

## What's Built

Verified end-to-end against real Cloudinary and MongoDB Atlas accounts.

- **Ingestion:** single and batch upload (images and video) to Cloudinary, with
  an auto-orient / enhance / sharpen pre-processing pass, project, location,
  stage and capture date.
- **Understanding:** Cloudinary AI Vision (`ai_vision_general`) → structured
  observation (activity, objects, tags, caption). Video is analysed via a
  still frame. Failures are surfaced, never faked.
- **Verification layer:** every asset is checked and gets VERIFIED / UNVERIFIED
  / FLAGGED with a stated reason per check — content vs claimed project,
  consistency with the project's other evidence, duplicate/reuse detection
  (perceptual hash, within and across projects), claimed vs EXIF capture date.
- **Before/after:** side-by-side pair with a grounded change description
  (diff of real observations), plus suggested pairs per location.
- **Impact indicators:** evidence mapped to UN SDG targets with an evidence
  score; weakly supported indicators are shown as "needs review", never
  asserted; each links to its backing photos.
- **Search:** natural-language, ranked, shows which concepts the query was
  understood as.
- **Views:** dashboard with analytics charts, timeline per project/location,
  Evidence Graph (photos as nodes, search-to-zoom), printable impact report.
- **Traceability:** each asset's record shows its Cloudinary public ID,
  version and transformation history.

### Known limitations (stated honestly)

- Observations describe what is visible; nothing here measures quantities
  ("68% of the roof") — the change description says so.
- Search and indicator mapping recognise the concepts in
  [`server/src/lib/lexicon.ts`](server/src/lib/lexicon.ts); an unlisted domain
  needs its concepts added. This is deliberate (auditable), not an LLM.
- The indicator score counts supporting assets; it is not a probability.
- Assets uploaded before the verification layer was added have no perceptual
  hash and can't be duplicate-matched.
- No authentication or per-organisation access control.

## Testing

`server/test/e2e.mts` exercises every core feature against a running API using real
Cloudinary and Atlas: upload and AI analysis, all verification outcomes, duplicate and
EXIF-date checks, search, comparison accuracy, indicators, cache invalidation and speed.
It uploads under `ZZTest ...` projects and deletes them afterwards.

```bash
cd server && npm run dev        # in one terminal
cd server && npm run test:e2e   # in another
```

## Demo dataset

`server/seed/manifest.json` lists real, dated repeat imagery from NASA, USGS
and Planet Labs (public domain / CC BY): Rondônia forest clearing 2014→2016,
Columbia Glacier 2019→2024 and the Aral Sea 1989→2008 — genuine same-site
before/after pairs — plus two deliberate integrity demos (a mismatched photo
and a reused photo). Each item is uploaded through the normal API, so AI
observations and verification results are computed, not scripted.

```bash
cd server
npm run seed                                  # localhost:4000
npm run seed -- --api https://<your-api>      # seed a deployed API
npm run seed -- --dry-run                     # validate downloads only
npm run seed -- --clean                       # remove everything it seeded
```

Image credits are in the manifest (`credit` field per item).

## Deployment

The API and client deploy separately.

1. **API (Render):** `render.yaml` defines the service. Set
   `DATABASE_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
   `CLOUDINARY_API_SECRET` and `CORS_ORIGIN` (the client's URL) in the
   dashboard. Atlas must allow the host under Network Access.
2. **Client (Netlify):** `client/netlify.toml` defines the build. Set
   `VITE_API_BASE_URL` to the API URL *before* building (Vite inlines it).
3. Check `GET <api>/api/health`, then upload one image from the deployed
   client.

Free Render instances sleep when idle; open the API URL once before a demo.

## Future / Optional Capabilities

These are enhancements from [REQUIREMENTS.md](REQUIREMENTS.md), not commit
ments:

- Automated before/after pair detection
- Natural-language (LLM-authored) narrative report text
- Role-based access / multi-organization support
- Geo-mapping view of evidence by location
- Tamper-evident provenance chain (hash-chained audit log)
- Auto-narrated progress video assembled from a project's timeline
- Public share links for generated reports
- Bulk import from external sources (cloud storage, CSV manifest)

## Project Docs

- [PROBLEM_STATEMENT.md](PROBLEM_STATEMENT.md) — the official problem, transcribed
- [REQUIREMENTS.md](REQUIREMENTS.md) — prioritized implementation checklist
- [ARCHITECTURE.md](ARCHITECTURE.md) — component design and Cloudinary mapping
- [MILESTONES.md](MILESTONES.md) — phased plan through the offline round
- [WORKLOG.md](WORKLOG.md) — dated log of work and decisions
- [docs/](docs/) — supporting notes, diagrams, and decisions as they accumulate
