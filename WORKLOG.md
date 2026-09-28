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

**Next up:** M1 — core scaffolding (Cloudinary account setup, `server/` and
`client/` bootstrapping, Prisma schema for Project/Location/Asset/
Observation).
