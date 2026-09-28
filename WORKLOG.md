# Work Log

Reverse-chronological log of work sessions: what was done, why, and what's
next. This is decisions and reasoning — `git log` already has the diffs, so
don't duplicate that here.

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
of `observationError`. After that (or in parallel): M3 — search, before/after
UI, basic report.
