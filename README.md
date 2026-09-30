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

**Headline USP: sensor-triggered disaster watch.** VisEvi does not wait for
someone to upload a photo. Live temperature at each monitored site (Google Maps
Platform Weather API, or any sensor posting to the intake endpoint) is watched
for heat and cold waves. A breach raises an alert, and VisEvi then uses its
Cloudinary evidence pipeline to compare the site's earliest and latest
captures, check whether the imagery corroborates the sensor, and produce a
one-URL Cloudinary before/after board with the reading stamped on it, plus a
suggested response checklist. See
[REQUIREMENTS.md § USP](REQUIREMENTS.md#usp-sensor-triggered-disaster-watch).

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

Optional, for the disaster watch:

- `GOOGLE_MAPS_API_KEY` — Google Maps Platform key with the **Weather API**
  enabled. Without it, temperature falls back to Open-Meteo (keyless) and the
  UI says which provider answered.
- `SENSOR_POLL_MINUTES` — automatic poll interval (default 15 with a Google
  key, otherwise off; "Check sensors now" always works).
- `SENSOR_WEBHOOK_SECRET` — if set, `POST /api/signals/ingest` from a physical
  sensor must send it as an `x-sensor-key` header.

To make existing locations monitored sites, run `npm run seed:sites` in
`server/` (or enter latitude/longitude when uploading).

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
- **Disaster watch (USP):** monitored sites (locations with coordinates) →
  live temperature (Google Maps Platform Weather API, Open-Meteo fallback, or
  sensor webhook) → threshold check → alert (one live alert per site and
  hazard, escalated in place) → assessment computed from the site's evidence:
  Cloudinary before/after board, change description, visual corroboration,
  staleness of imagery, priority and a suggested response checklist. Alerts
  can be acknowledged and resolved. The Disaster watch page also has a signal
  simulator that uses the same intake as a real sensor.
- **Maps (free, keyless):** an interactive Leaflet map of all monitored sites
  with temperature markers (OpenStreetMap tiles), a per-alert location map, and
  place-name to coordinates lookup on upload (OpenStreetMap Nominatim, run
  server-side with a User-Agent, 1 request/second and caching per its usage
  policy). Attribution is shown wherever OSM data appears. The site map has
  switchable NASA GIBS overlays (free, no key): live land temperature day and
  night (hot and cold zones), rainfall rate and soil moisture, plus
  historical disaster-prone zones (drought, flood, cyclone, landslide, from
  NASA SEDAC Natural Disaster Hotspots). Live layers are satellite
  observations one to five days behind, with gaps under cloud; the
  prone-zone layers are historical maps, not forecasts. Layer availability
  was checked against GIBS (which serves blank tiles for missing dates). The public tile
  server is for light use; put a tile provider in front of it before heavy
  production traffic.
- **Automatic response loop:** when a live alert is raised or escalates, the
  server fetches a fresh NASA Worldview snapshot of the site (skipping cloudy
  or no-data days), pushes it through the normal Cloudinary pipeline, compares
  it with the same season a year earlier, and records whether the imagery
  **confirms**, **does not confirm**, or is **inconclusive**. Confirmed alerts,
  and emergencies (which should not wait for a satellite pass), notify the
  responsible contacts by email (any SMTP server) and/or free ntfy.sh push,
  with an in-app record of every message. Every step is stored on the alert.
- **Provenance verification:** satellite images have no uploader "claim" to
  test, so they are verified by provenance. The server re-requests the same
  snapshot from NASA and only marks the upload verified if it matches (a genuine
  snapshot matches exactly; a fake presented as NASA is flagged).
- **Same-place comparison:** two NASA snapshots of the same coordinates are the
  same place by construction (from capture metadata, not guessed from a coarse
  fingerprint, which cannot tell "same place, different season" from
  "different place"). The comparison then measures vegetation greenness,
  water-like area and cloud cover with cloud masked out, and prefers a
  same-season pair. A "share of ground changed" figure was tried and dropped:
  on real pairs it did not separate the same site a year apart from unrelated
  sites, so reporting it would have looked precise without being so.
- **Risk index (0 to 100) with confidence:** a transparent weighted formula,
  not a trained model, over six sourced factors: long-run exposure (NASA
  hazard maps, decoded at the site's coordinates), live conditions, 7-day
  outlook, recent incidents, nearby NASA events, and hazard signs in the
  site's Cloudinary-analysed imagery. Weights are 25/20/20/15/10/10 and are
  returned with every result; an unavailable factor is dropped, never counted
  as safe. Confidence is a separate weighted trust in each factor (freshness,
  coverage, evidence count).
- **Smarter triggers:** an alert fires when a reading is unusual *for that
  place, month and hour* (compared with ten years of Open-Meteo archive
  history, cached per site), or crosses a fixed limit, or when coastal waves
  (Open-Meteo Marine) reach 2.5 m or more. Anomaly-only alerts need a
  stressful absolute temperature and cannot exceed "warning"; "emergency"
  needs a real threshold. So heat/cold alerts work worldwide, not only on
  Indian plains.
- **Live events:** NASA EONET open events (storms, floods, volcanoes, heat
  extremes, and wildfires near monitored sites) are drawn on the map and
  listed on an alert when they are within 300 km and relevant to its hazard.
- **Contacts:** `POST /api/signals/contacts` (or the Disaster watch page) sets
  who is told, per site and from which severity up. ntfy needs no account:
  install the ntfy app and subscribe to a hard-to-guess topic name.
- **Bulk demo data:** `npm run seed:satellite` (in `server/`) uploads dated
  NASA Worldview satellite snapshots for 13 hazard-relevant sites through the
  real upload API, screening out cloud and no-data passes. Use `--dry-run`,
  `--only <site>`, `--per-site N`, `--clean`. Each upload spends one
  Cloudinary AI analysis. Project names are deliberately neutral because
  verification treats a project name as a claim about its media.
- **Historical replay:** `npm run replay` (in `server/`) feeds real hourly
  ERA5 history (Open-Meteo archive, free) through the same alert engine and
  records dated, resolved incidents: a heat or cold wave closes after 48 quiet
  hours, a wave alert after 12. Defaults to 1 Apr to 30 Jun 2026; try
  `-- --from 2024-05-15 --to 2024-06-05` for the May 2024 heat wave (Barmer
  48 C). `--dry-run` lists incidents without writing, `--only <site>`,
  `--clean` removes only replayed data. A closed alert cites only evidence
  captured before it closed. Caveats: a period inside the ten-year baseline is
  part of its own "normal", and a fixed 37 C "watch" is met almost daily in a
  Rajasthan summer, so such an incident can last weeks.
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
- Hazard thresholds are absolute and calibrated for India-like plains
  (heat >= 40 C, cold <= 4 C, following IMD criteria). Sites beyond 38 degrees
  of latitude record readings but never raise alerts, because a fixed cold
  threshold would fire on an ordinary day in Alaska. They are a starting point
  for an operator's own SOP, not an official warning.
- Visual corroboration is a lexicon match on Cloudinary AI Vision output
  (dry, cracked, parched, smoke, snow and similar words), so "uncorroborated"
  often just means the imagery predates the event. The response checklist is
  generic guidance, not a substitute for official procedure.
- Alerts are never auto-resolved when the temperature falls; a person closes
  them.
- Satellite views are MODIS true colour at about 250 m per pixel: they show
  drying, snow and gross water change, not waves, cold, or street-level damage.
  Confirmation is therefore often "inconclusive" or "not confirmed", by design.
- Hazard exposure comes from NASA SEDAC maps of 1980 to 2003, on a global scale
  (Bay of Bengal cyclones sit low on a scale dominated by West Pacific
  typhoons), so it describes long-run concentration, not today.
- The risk index weights are judgement. It has not been validated against
  recorded disaster outcomes.

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
