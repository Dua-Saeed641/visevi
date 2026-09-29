# Work Log

Reverse-chronological log of work sessions: what was done, why, and what's
next. This is decisions and reasoning — `git log` already has the diffs, so
don't duplicate that here.

---

## 2026-09-29 (later)

### Session 8 — M5, M6, most of M7, deploy configs

Confirmed the Cloudinary AI Vision add-on is now live (real caption returned, 100k quota). User's idea of routing runtime input "through the terminal" to Claude was declined as a design: a deployed demo can't depend on a local session. All reasoning is deterministic server code instead (explainable, no keys); one seam (`lib/lexicon.ts`) is where an LLM could be plugged in later.

- **Verification (M5):** `lib/verify.ts` — four checks, each with a stated reason: content vs claimed project/stage, consistency with the project's other evidence, duplicate/reuse (64-bit dHash via `sharp`, hashed from raw bytes before Cloudinary preprocessing; only the *later* copy is flagged), claimed vs EXIF capture date (EXIF via Cloudinary `image_metadata`). Any fail → FLAGGED; a passed content check → VERIFIED; otherwise UNVERIFIED. `POST /api/assets/:id/reverify` and `/reverify-all`.
- **Change narrative:** `lib/narrative.ts` diffs real observations (objects/tags/themes/activity) — no invented measurements; says so when an observation is missing.
- **Indicators (M6):** `lib/indicators.ts` SDG table + evidence score = 0.7·volume + 0.3·coverage; flagged assets excluded; ≥0.5 asserted, else "needs review". A single photo can never assert an indicator (max 0.44). Score is *not* a probability, UI says so.
- **Search / graph (M7):** `lib/semantic.ts` TF-IDF with query expansion through the concept lexicon, and reports which concepts it used. Honest limit: recognises only lexicon concepts, not true embeddings. `GET /api/reports/graph` + hand-rolled SVG force layout page.
- Traceability: asset detail modal shows Cloudinary public ID/version, transformation history, all check results. Note: preprocessing is an *incoming* transformation, so it is baked into the stored asset.
- Also: video analysed via a poster frame, batch upload, stage/capture-date fields, Timeline page, suggested before/after pairs, `netlify.toml`, `render.yaml`.
- **Verified live** against real Cloudinary + Atlas with temp `ZZTest` data (since deleted): genuine solar photo → VERIFIED; bee photo filed as solar → FLAGGED; same photo reused in another project → FLAGGED (distance 0); two solar photos → indicators asserted at 0.58, one → needs-review. Found and fixed along the way: "collection" triggering Waste, over-eager indicator scoring, repeated object labels.
- **Not verified:** the new UI pages were never viewed in a browser (Chrome extension not connected) — only `tsc`, build and lint. Eyeball Graph, Report and Upload before demo.
- Test servers ran on 4001/5174 so the user's own dev servers were left alone; existing assets uploaded before this session have no perceptual hash — run `POST /api/assets/reverify-all` (hash stays null for them, so they can't be duplicate-matched; re-upload if needed).

**Next up:** actual deployment (needs user's Netlify/Render accounts), demo dataset (M8), fonts, README refresh.

### Session 9 — Submission is in 24h (not 3 Oct)

- Decided **not** to pivot the product to a science/anthropology framing before submission (off-brief for the judging rubric; photos can't show evolution). Parked as a post-submission idea: a swappable domain "research pack" (lexicon + standards mapping), pitched around research image integrity — the existing verification layer already fits.
- Dashboard analytics charts (verification by project, themes, evidence over time; table view) via `GET /api/reports/overview`. Graph reworked: photos are nodes, search flies the camera to matches.
- README brought in line with reality (was still saying AI blocked / verification unbuilt); added Deployment and Known limitations. Server production build (`tsc` + `node dist`) verified.
- Found: user's API on :4000 was a stale pre-reports process (`Cannot GET /api/reports/...`); needs restart.

### Session 10 — speed, graph bug, demo dataset

- **AI speed:** upload was ~11s, dominated by AI Vision (4 prompts answered serially, ~7s). One combined prompt takes ~2.4s with equivalent output (measured live); kept the 4-prompt path as automatic fallback if the model doesn't return 4 lines. Preview images now use Cloudinary-resized renditions (266KB → 30KB on a large image). Batch upload runs 3 in parallel, then re-verifies the library.
- **Graph bug (mine):** `onPointerUp` left the drag state non-null, so every later mouse move panned the view by a huge jump (zoom looked dead); `setPointerCapture` also swallowed node clicks. Fixed.
- **Real bug found by seeding:** the 64-bit perceptual hash flagged a genuine 2014 vs 2016 same-site pair as a duplicate (distance 8/64). Measured alternatives on real pairs and altered copies: 256-bit hash, threshold 40/256 (worst re-encoded copy 33, closest genuine pair 48). Limitation stated: crops are not caught.
- **Dataset:** `server/seed/` (manifest + script, seeds via the real API). Chose only images whose source metadata I could confirm; dropped a Lake Mead file whose metadata contradicted its filename. Lexicon gained forest-cover / glacier-ice / water-body concepts and SDG 6.6.
- Unrequested file found: `server/src/scripts/seedIndiaData.ts` (not from this session) fabricates "simulated" observations with confidence 0.94 and hard-codes VERIFIED when AI analysis fails — contradicts the no-faked-results rule. Only removed an unused import that broke `tsc`; flagged to the user rather than deleted.

### Session 11 — full UI redesign and feature testing against seeded data

- **Redesign (user request):** two-tone red and white (every other colour is a tint/shade), Helvetica, no emoji, root font raised to 18px (20px at 1700px+) so type and spacing scale together. New hero page at `/`; persistent sidebar; flat editorial "contact sheet" library cards instead of rounded cards; compare button moved to a floating bar at bottom centre after two photos are selected. Analytics page moved to `/dashboard`, evidence grid to `/library`.
- **Charts** rewritten for an analyst (true pixel size, axis titles, gridlines, whole-number count axes, direct labels, tooltips, table view): capture-date swimlanes per project (the old month axis was unreadable because the seed spans 1989–2024), assets by capture year stacked by status, verification by project, per-check pass/fail rates, themes, indicator scores with the 50% assert threshold. Status uses solid / light / hatched fills so it survives a two-tone palette.
- **Tested in a real browser** (DOM-level; the tab was hidden so screenshots hang): every page — no horizontal overflow, min font 14.4px, zero emoji, Helvetica, no broken images; library search + compare bar; graph pan/no-pan-after-release regression + search highlight; charts' real values. **Not visually inspected:** the desktop layout at 1900px+ and the graph camera fly-to animation (needs a visible tab: requestAnimationFrame is paused when hidden).
- **Bugs found by testing and fixed:** chart SVG overflowed its grid column (grid tracks sized to content); fractional ticks on count axes (0.5 assets); Report opened on a 1-photo test project; and — most important — the lexicon produced false SDG claims: "winding" stems to "wind" (a forest project asserted SDG 7.2 renewable energy), hyphenated lexicon terms were split into parts ("wind-farm" re-added "wind" and "farm"; "clean-up" matched "clean"), "lighting" matched "light blue", and generic "water" asserted SDG 6.1 drinking water for a glacier. Removed hyphenated/ambiguous terms, added a specific drinking-water concept. Asserted indicators fell from 10 to 4, all plausible.
- The tool flagged the Sundarbans "baseline" photo from `seedIndiaData.ts`: it shows a road, not mangroves. The old seed's Unsplash picks don't match their labels.

### Session 12 — Hermes Agent-inspired home page (REVERTED same day at the user's request)

- Reference: hermes-agent.nousresearch.com. Per the user, only **design features** were borrowed (centred hero, dual CTAs, copyable terminal command block, full-width hero image, numbered feature rows with imagery, FAQ accordion, multi-column footer, fewer heavy borders); palette (red/white) and content unchanged.
- Neural-network backdrop replaced by a photo of the **Hermes Ludovisi** (Hermes Logios type; Roman copy, Palazzo Massimo; public domain via Wikimedia Commons), greyscaled and screen-blended over the brand red so it stays two-tone. `client/public/hermes-logios.jpg`. Credit in the footer.
- Feature illustrations on the home page use live data from the seeded library (real thumbnails, check results, indicator scores, a real glacier search) rather than mock-ups.
- Not visually verified (user declined browser use): build + lint + image served only.
- **Reverted:** the user preferred the previous red/white design entirely. Restored the neural-backdrop hero, four-step Home page and heavier rules; removed the statue image and FAQ/footer/terminal-block version. Tweaks to be re-applied later, individually.

### Session 13 — revert, speed, precise comparisons, full feature test

- **Reverted the Hermes redesign** at the user's request (they preferred the previous red/white design entirely): restored the neural-backdrop hero and four-step Home page, heavier rules; removed the statue image. To be re-tweaked later, one change at a time.
- **Speed (fetching):** measured first: every endpoint 30-270ms, dominated by ~30ms Atlas round trips (server itself 2ms), with report/compare making several sequential queries. Added a version-stamped in-process response cache (cleared on every write, 60s TTL cap) applied to all report GETs and the asset list/detail; lean list payload (check details only on the detail endpoint, which the Library fetches on open); parallel queries in the project report; gzip. Cached reads now median 9-17ms (was 30-270ms).
- **Comparison engine rewritten** (`lib/narrative.ts`), every statement derived from data and hedged to what it supports:
  - interval from *capture dates only*; upload time is never used (the old code silently did), and a missing date is stated;
  - "same place?" from the 256-bit fingerprint in tiers calibrated on real pairs (repeat photography 48-50; Aral Sea after a huge change 103; unrelated 114-136), worded so it never over-claims;
  - content compared as recognised themes and object head-nouns (stable) instead of raw AI labels; overlap percentages; activity wording differences softened when themes agree;
  - comparability verdict (comparable / limited / not a valid before-after) with reasons; caveats for different projects/locations, flagged or unverified images, missing observations; always states nothing is measured.
- **Full feature test** (`npm run test:e2e`, 74 checks, real Cloudinary + Atlas, self-cleaning): 74 pass. Found and fixed two real bugs it exposed:
  1. **A wildly wrong photo (flower filed under "Solar Village") was VERIFIED**: the place-word "village" mapped to a generic Community concept and one caption word matched it. Place/people concepts no longer satisfy a content check on their own.
  2. **The EXIF date-tamper check had never worked in production**: Cloudinary returns the embedded date only for an untransformed upload; ours uses incoming transformations so the returned metadata came from the EXIF-stripped copy. The date is now read from the original bytes locally (`lib/exif.ts`); the test proves a contradicting date is flagged.
  Also corrected my own wrong test expectations (Columbia interval is 1,872 days), a test image that was legitimately a copy, and misleading theme labels ("Water supply" for a glacier, "Lakes, seas" for a river).
- **Not covered by tests:** video upload, the UI (no browser use; build + lint only), and the graph camera animation.
- **Data caveat:** the Aral Sea 1989 date is approximate in the source ("July-September"), but is stored as 1 Sep 1989, so the interval reads more precisely than the source supports.

### Session 14 — logo, fonts, cards, better before/after UX

- **Logo:** white-eye version on a red tile as favicon/apple-touch icon and hero; the new red-on-white eye (converted to true transparency from a baked-white PNG, exact brand red) in the sidebar and mobile bar. Both link home.
- **Fonts:** Qurova (wordmark + h1 only), Elegance Natural Valentine (h2/h3), Helvetica for everything else; single-weight fonts so faux-bold is disabled. Both verified to contain full A-Z/a-z/0-9/punctuation.
- **Readability:** root font 20px (22px at 1700px+), line-height 1.65, chart text 16-17px, much of the explanatory copy cut to one line. Sidebar narrowed to keep content room.
- **Cards** (white, hairline border, soft shadow, red top accent where useful) on analytics KPIs and charts, library items and filters, report stats/indicators/timeline, upload form/results, timeline items.
- **Compare page rebuilt:** drag-to-reveal slider (native range input: draggable, touch, arrow keys) with Split/Show before/Show after, side-by-side toggle, verdict card, four fact tiles (time apart, framing, overlap, verification), separate insight cards (same place, activity, themes, objects), collapsible caveats, record cards.
- Not visually verified (no browser use): build + lint only.

---

## 2026-09-28

### Session 1 — Project initialization

- Read the official problem statement PDF (Geek Room hackathon, Problem
  Statement 02 · Cloudinary — *AI-Powered Impact & Sustainability Media
  Platform*).
- Transcribed it faithfully into `PROBLEM_STATEMENT.md`, separating explicit
  requirements from design interpretation.
- Derived `REQUIREMENTS.md` (Core / Important / Enhancement tiers) and
  `ARCHITECTURE.md` (component design, Cloudinary capability mapping).
- Scaffolded the repo: README, `docs/`, `client/`, `server/` placeholders.
  No application code yet — deliberate, per explicit instruction to
  establish the foundation before building features.
- Commit: `c51063b` — initial scaffolding.

### Session 2 — Organizer kickoff notes

- Folded in notes from the Cloudinary + Hack Culture kickoff call:
  submission process (Hack Culture platform, GitHub link + live demo link
  required, must be deployed before submission), and the explicit judging
  signal that Cloudinary integration must be *deep*, not basic storage.
- Resolved several previously-open questions in `REQUIREMENTS.md`.
- Captured the problem owner's own design specs (metadata JSON shape,
  semantic search example, before/after change-description requirement,
  report mockup, "verified activities" framing) as authoritative design
  targets, since they came directly from the person defining the project.
- Added `docs/MEETING_NOTES.md` as the source record.
- Commit: `a92441d`.

### Session 3 — Differentiator strategy

- Identified the gap: the problem statement names "verify" as a pain point
  in its problem framing, but the six stated goals don't operationalize
  it — an opening most competing teams are likely to miss entirely.
- Locked in the **verification & trust layer** (consistency check,
  duplicate/reuse detection, field-photo pre-processing, AI-described
  before/after change) as VisEvi's core differentiator, threaded
  consistently through `README.md`, `ARCHITECTURE.md`, `REQUIREMENTS.md`.
- Added a second differentiator: **Impact Indicator Auto-Mapping** (project
  evidence → UN SDG indicator codes), targeting a real, expensive manual
  pain point in NGO/development-sector reporting that generic media-AI
  tools don't address.
- Commit: `1851d00`.

### Session 4 — Elaboration, UI direction, milestones

- Elaborated the indicator-mapping feature with a second, messier example
  (a mangrove restoration project) demonstrating multi-indicator output,
  per-indicator confidence, and — the key design decision — deliberately
  withholding low-confidence claims instead of asserting them, reinforcing
  the same verification discipline applied to reporting rather than just
  individual assets.
- Discussed a "neuron/connectome" UI concept, initially raised as "can fruit
  fly neurons be used" (referencing the FlyWire Drosophila brain
  connectome). Clarified: not usable as a computational technique (it's a
  map of one specific brain, not an algorithm), but legitimate as a visual
  language for a knowledge-graph view of the evidence library. Flagged
  side-effect risks: dense-graph legibility ("hairball problem"), render
  performance, accessibility, and build-time cost relative to what's
  actually being judged.
- Project owner supplied concrete visual references (Colorpong "Neurones"
  vector bundle — dark background, radial organic neuron-network line art)
  and confirmed intent to feed in fonts later. Captured as
  `docs/UI_DIRECTION.md`, with an explicit note that the purchased vector
  art is inspiration-only and shouldn't ship in the product — VisEvi's own
  version should be generated from real evidence-graph data.
- Added `MILESTONES.md` (phased plan from today through the 11 Oct offline
  round, sequenced so Core requirements are demoable by the 3 Oct online
  deadline and differentiators layer on afterward) and this `WORKLOG.md`.

**Next up (at the time):** M1 — core scaffolding.

### Session 5 — M1 core scaffolding

- User confirmed all git operations (commit/push) stay on their side from
  here on — work is done and left uncommitted for them to review and commit.
- Scaffolded `client/`: Vite React-TS template, Tailwind CSS v4 (via
  `@tailwindcss/vite`, not the old postcss config path), React Router. Built
  a dark-theme shell (`src/index.css` — palette matches
  `docs/UI_DIRECTION.md`), a `Layout` with nav, and two routes: `Dashboard`
  (asset grid, empty/loading/error states) and `Upload` (form posting to the
  server). `npm run build` and `npm run lint` both clean.
- Scaffolded `server/`: Express + TypeScript, Prisma (`Project` / `Location`
  / `Asset` models — `Asset` already carries `verificationStatus` and
  `perceptualHash` fields for M5, so that migration won't be a schema
  rewrite later). Routes: `GET /api/health`, `GET /api/assets`,
  `POST /api/assets/upload` (multipart → Cloudinary upload → Prisma
  persist). `tsc --noEmit` and a full `tsc` build both clean.
- Notable friction: Prisma 7 (installed as `latest`) moved the database
  connection string out of `schema.prisma` into a separate
  `prisma.config.ts` using a driver-adapter model (`@prisma/adapter-pg`)
  instead of the old `datasource.url` field. Pinned the Prisma CLI to the
  last pre-this-change stable release (`7.10.0`, matching `@prisma/client`)
  rather than the `8.0.0-rc` "latest" tag, since a release candidate isn't
  worth the risk mid-hackathon. Verified `prisma generate` and the adapter
  wiring both work with a throwaway placeholder `DATABASE_URL`.
- The Cloudinary upload path (`src/lib/cloudinary.ts`) already applies the
  pre-processing pass from the verification-layer design (auto-orient,
  `e_improve`, `e_sharpen`) before the (not-yet-wired) AI tagging step.
- The server intentionally fails fast and loud if `DATABASE_URL` or the
  Cloudinary credentials are missing (see `src/env.ts`) — confirmed this
  produces a clear, specific error rather than a confusing crash, since
  real credentials don't exist yet.
- **Not done, and can't be done by me:** creating the actual Cloudinary
  account and a Postgres instance, and filling in the real `.env`. Nothing
  past that point (`npm run prisma:migrate`, an actual live upload) has been
  exercised yet.

**Next up (at the time):** you fill in `.env`, then confirm a real upload
round-trips, then M2.

### Session 6 — Architecture correction: Postgres/Prisma → MongoDB Atlas, M2 implemented

User provided real Cloudinary and MongoDB Atlas credentials and issued a
corrected architecture direction: Cloudinary as the primary media + AI layer
(not just storage), MongoDB Atlas (official driver, no ORM — explicitly not
Prisma's Mongo connector) as the application knowledge store, semantic
search deferred to M7, no external LLM before M6. Instructed to inspect
current state and report before migrating — did so; found that
`schema.prisma` had already been switched to Prisma's own MongoDB connector
(unintentional, per the user), which the user then explicitly said to
discard in favor of the native driver.

**Prisma removal:** deleted `prisma/`, `prisma.config.ts`,
`src/lib/prisma.ts`; uninstalled `prisma`, `@prisma/client`,
`@prisma/adapter-pg`, `pg` (153 packages). Installed the official `mongodb`
driver instead.

**MongoDB migration:** `src/lib/mongo.ts` (connection singleton + index
creation: unique on project name, unique on `(projectId, name)` for
locations, unique on asset `cloudinaryPublicId`, plus lookup indexes) and
`src/lib/models.ts` (documented, not enforced, TypeScript shapes for the
three collections — Mongo is intentionally schema-less). Rewrote the four
Prisma calls in `assets.ts` as native driver calls: `findOneAndUpdate` with
`upsert: true` for project/location, `insertOne` for assets, an aggregation
with `$lookup` (not N+1 queries) for the asset list. REST contract and
client untouched, as instructed.

**Real connection debugging:** the user's `.env` initially had
`DATABASE_URL=mongodb://127.0.0.1:27017/visevi` (local, nothing running) —
no local Mongo/Docker available in this environment to stand up a real one,
so a temporary `mongodb-memory-server` install was attempted for
verification purposes only; user redirected to just provide real Atlas
credentials instead (better call — removed the memory-server dependency
once real Atlas creds worked). First real Atlas attempt failed on auth
(password/encoding issue on the user's end); second attempt connected
cleanly. Full upload flow verified against real Cloudinary + real Atlas:
upload → Cloudinary → Mongo persist → `$lookup` read-back, including
confirming the project/location upsert doesn't create duplicates on a
second upload to the same project.

**Cloudinary AI research (as instructed, before writing M2 code):**
searched and fetched current official docs. Found the installed `cloudinary`
npm package (2.11.0) does *not* wrap the newer Analyze API (Beta) named-model
endpoint (`POST /v2/analysis/<cloud>/analyze/<model>`) — its `analyze_uri`
helper targets a different, older endpoint. Verified this by reading the
SDK's own source rather than assuming. Implemented `analyzeAsset()` calling
the REST endpoint directly with Basic Auth, using the `ai_vision_general`
model (open-ended prompts) rather than `ai_vision_tagging` (which requires a
predefined ≤10-tag closed vocabulary — conflicts with the "no static/
template metadata" requirement). Confidence is never invented: the endpoint
documents none, so it's always `null`.

**M2 verification, and a real Windows process bug found along the way:**
first two live-upload tests showed `observation: null` with *no* error
logged anywhere, which shouldn't have been possible given the code. Traced
it to `TaskStop` only killing the tracked wrapper shell on Windows, not the
underlying `node.exe` child `npx` spawns — an old, stale server process kept
answering on port 4000 running pre-AI-Vision code, while the "new" process
had actually failed to bind the port. Found and killed all orphaned
`tsx src/index.ts` node processes directly via PowerShell
(`Get-CimInstance Win32_Process` + `Stop-Process`), confirmed a single clean
process, and re-ran the same test: real, correctly-surfaced result this
time — `observationError: "...account does not have an active subscription
for feature (auth_error)..."`, both in the API response and the server log.
Probed three different analysis models (`ai_vision_general`, `captioning`,
`google_tagging`) directly — all three fail identically, confirming this
Cloudinary account has no AI analysis add-on enabled at all (account-level
gap, not a bug in any one code path).

**Lesson for future sessions on this machine:** `TaskStop` is not reliable
for killing `npx`-spawned Node child processes on Windows — always verify
with `netstat -ano | grep LISTENING` (or check process start time against
file mtimes) after stopping a dev server before trusting that a restart
picked up new code, and prefer killing by PID via PowerShell
`Get-CimInstance Win32_Process` when in doubt.

All test data (test projects/assets in both Mongo and Cloudinary) cleaned up
after verification. Final state: `tsc --noEmit` clean, full `tsc` build
clean, client build clean and unaffected, git status shows only the
expected uncommitted files, no stray processes, no stray temp files.

**Next up:** M2 is code-complete and verified but needs a Cloudinary AI
add-on actually enabled on the account to produce a real observation instead
of `observationError`.

### Session 7 — M3 Search, Before/After & Visual Impact Report Implementation

- Resolved MongoDB Atlas network access IP whitelist (`0.0.0.0/0`) and connection string hostname. Server boots and connects cleanly.
- Implemented **Search & Filtering** on backend (`GET /api/assets?q=...&status=...&project=...`) and frontend `Dashboard.tsx`:
  - Search by keyword matching tags, captions, activities, objects, project names, locations, and stages.
  - Verification status badges (`VERIFIED`, `UNVERIFIED`, `FLAGGED`) and tag chips displayed on asset cards.
  - Interactive selection checkboxes for pair comparison directly on evidence cards.
- Implemented **Before/After Comparison** endpoint (`GET /api/reports/compare`) and dedicated `Compare.tsx` page:
  - Side-by-side visual comparison cards for baseline vs follow-up evidence.
  - Computed change metrics: interval time span, activity shift description, added visual tags (+), and removed visual tags (-).
- Implemented **Visual Impact Report Generator** endpoint (`GET /api/reports/project/:projectId`) and `Report.tsx` page:
  - Project executive overview header with metrics cards (total assets, verified count, location count, flagged count).
  - Categorized field activity summary.
  - Featured progress transformation showcase.
  - Printable / Export PDF styling ready for stakeholder presentation.
- Client build (`npm run build`), server build (`npm run build`), and oxlint (`npm run lint` — 0 errors, 0 warnings) clean.

**Next up:** M4 — Online Round Submission preparation (deployment & demo verification) or M5 — Verification & Trust Layer.

