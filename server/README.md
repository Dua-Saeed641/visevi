# server/

VisEvi's API — Node.js + TypeScript + Express, the official MongoDB Node.js
driver (no ORM), Cloudinary SDK + a direct call to Cloudinary's Analyze API
(Beta) for AI Vision analysis.

## Setup

```bash
npm install

# from repo root: cp .env.example .env, then fill in:
#   DATABASE_URL (a MongoDB Atlas connection string, including the db name
#     in the path — e.g. mongodb+srv://user:pass@cluster.mongodb.net/visevi)
#   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
# server/ reads the shared .env at repo root — see src/env.ts

npm run dev   # http://localhost:4000
```

No migration step — Mongo is schema-less. `src/lib/mongo.ts` creates the
required indexes (unique constraints on project name, location name per
project, asset `cloudinaryPublicId`) automatically on first connect.

The server fails fast with a clear error naming the missing variable if
`DATABASE_URL` or the Cloudinary credentials aren't set. Atlas also blocks
all connections by default — add your IP (or `0.0.0.0/0` for a hackathon
demo) under Atlas → Network Access, or you'll get a connection timeout, not
an auth error.

## Structure

```
src/
├── env.ts              loads the shared repo-root .env, validates required vars
├── lib/mongo.ts          MongoDB client singleton + index setup
├── lib/models.ts         documented TypeScript shapes for the 3 collections
├── lib/cloudinary.ts      upload + pre-processing pass + AI Vision analysis
├── lib/lexicon.ts        concept lexicon shared by verification/indicators/search
├── lib/verify.ts         the four verification checks
├── lib/phash.ts          64-bit perceptual hash (sharp)
├── lib/indicators.ts     SDG lookup table + evidence score
├── lib/narrative.ts      before/after change description
├── lib/semantic.ts       ranked concept-aware search
├── routes/health.ts      GET /api/health
├── routes/assets.ts      assets: list/search, detail, upload, re-verify
└── routes/reports.ts     compare, project report, overview, graph
```

## Endpoints (current)

- `GET /api/health` — liveness check
- `GET /api/assets?q=&project=&location=&status=` — list/search; with `q`,
  results are ranked and carry `match` (score + concepts the query was
  understood as)
- `GET /api/assets/:id` — full record incl. verification checks and
  transformation history
- `POST /api/assets/upload` — multipart (`file`, `project`, `location`,
  optional `stage`, `capturedAt`); uploads, analyses, hashes, verifies
- `POST /api/assets/:id/reverify`, `POST /api/assets/reverify-all`
- `GET /api/reports/compare?beforeId=&afterId=`
- `GET /api/reports/project/:id` — report incl. indicators, suggested pairs
- `GET /api/reports/projects`, `/overview`, `/graph`, `/indicator-table`

## Notes on the MongoDB setup

Three collections — `projects`, `locations`, `assets` — kept normalized
(asset documents reference `projectId`/`locationId`) rather than embedding,
since the upload flow genuinely needs upsert-by-name semantics on projects
and locations independent of any one asset. This is not a relational schema
recreated in Mongo — there's no migration system, no schema enforcement, and
`assets` documents are free to carry an open-ended `observation` object
shaped however the AI analysis actually returns it (see `src/lib/models.ts`
for the documented, not enforced, shape).

`GET /api/assets` uses a `$lookup` aggregation instead of the N+1 query
pattern a naive per-document lookup would produce.

See [../ARCHITECTURE.md](../ARCHITECTURE.md) for how this fits the rest of
the system.

## Notes on the Cloudinary AI Vision call

The installed `cloudinary` npm package (2.11.0) does not wrap the Analyze
API's named-model endpoint (`POST .../analyze/ai_vision_general`) — its
`analyze_uri` helper targets a different, older endpoint shape. `analyzeAsset`
in `src/lib/cloudinary.ts` calls the documented REST endpoint directly. See
that file's comments for the official doc links and why `ai_vision_general`
was chosen over `ai_vision_tagging` (the latter requires a predefined closed
tag vocabulary, which conflicts with VisEvi's "no static/template metadata"
requirement).

If the Cloudinary account doesn't have an AI analysis add-on enabled, uploads
still succeed — the asset and its Cloudinary media are real and persisted,
but `observation` stays `null` and the upload response includes an explicit
`observationError` explaining why, both to the client and in the server log.
Nothing is faked in its place.
