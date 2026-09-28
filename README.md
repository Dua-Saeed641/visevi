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
client (React)  ⇄  server (Node/Express)  ⇄  Cloudinary (media + AI)
                          │
                          ⇄  PostgreSQL (projects, locations, metadata)
                          ⇄  LLM provider (embeddings, report synthesis)
```

Full detail: [ARCHITECTURE.md](ARCHITECTURE.md).

## Planned Technology Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite, Tailwind CSS |
| Backend | Node.js + TypeScript + Express |
| Database | PostgreSQL + Prisma ORM |
| Media platform | Cloudinary (upload, transformations, AI add-ons, Search API) |
| AI / LLM | Claude or OpenAI API (embeddings + report text generation) |
| Semantic search | Cloudinary Search API (metadata/tags) + optional `pgvector` for description-level similarity |

This stack is a starting point chosen for hackathon speed and strong
Cloudinary SDK support — not yet implemented, and open to change.

## Local Development Setup

> Not yet applicable — no application code exists yet. This section will be
> filled in once `client/` and `server/` are scaffolded.

Planned setup (once implemented):

```bash
# clone and enter the repo
git clone <repo-url> && cd VisEvi

# copy environment variables and fill in real values
cp .env.example .env

# backend
cd server && npm install && npm run dev

# frontend (separate terminal)
cd client && npm install && npm run dev
```

## Environment Variables

See [.env.example](.env.example) for the full list. At minimum, expect to
configure:

- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `DATABASE_URL`
- An LLM provider key (e.g. `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`)

## Current Project Status

**Initialization stage.** No application features are implemented yet. What
exists so far:

- [x] Problem statement read and transcribed ([PROBLEM_STATEMENT.md](PROBLEM_STATEMENT.md))
- [x] Requirements extracted and prioritized ([REQUIREMENTS.md](REQUIREMENTS.md))
- [x] Architecture direction documented ([ARCHITECTURE.md](ARCHITECTURE.md))
- [x] Repository scaffolding (this README, docs, folder structure)
- [ ] Backend scaffolded
- [ ] Frontend scaffolded
- [ ] Cloudinary integration
- [ ] Any feature work

Nothing below "Current" should be read as already built.

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
