# Milestones

Timeline anchored to the two hackathon dates from
[PROBLEM_STATEMENT.md](PROBLEM_STATEMENT.md): **3 Oct 2026 (online round)**
and **11 Oct 2026 (offline round)**. Today: 2026-09-28.

Dates below are planning targets, not commitments — update this file as work
actually lands, and log what really happened in [WORKLOG.md](WORKLOG.md).

Status legend: `[x]` done · `[ ]` not started · `[~]` in progress

---

## M0 — Foundation — 2026-09-28 — DONE

- [x] Problem statement read and transcribed
- [x] Requirements extracted and prioritized (Core/Important/Enhancement)
- [x] Architecture documented (components, Cloudinary capability mapping)
- [x] Repo scaffolding: README, docs/, client/, server/ placeholders
- [x] Organizer kickoff notes folded in; submission-process open questions resolved
- [x] Differentiator locked in: verification & trust layer
- [x] Second differentiator locked in: impact indicator auto-mapping
- [x] UI direction captured (dark theme, connectome-inspired Evidence Graph)

## M1 — Core Scaffolding — target 2026-09-29 → 2026-09-30

- [ ] Cloudinary account set up, credentials in `.env`
- [ ] `server/` scaffolded: Node + TypeScript + Express, Prisma schema for
      Project / Location / Asset / Observation
- [ ] `client/` scaffolded: React + TypeScript + Vite, base routing, dark
      theme shell
- [ ] Upload endpoint working end-to-end: client → server → Cloudinary,
      asset record persisted in Postgres

## M2 — Core Pipeline — target 2026-10-01

- [ ] Cloudinary AI add-on wired for auto-tagging/captioning
- [ ] Structured observation written per asset (project/location/stage/tags/
      objects/activity) — dynamically generated, per the problem owner's
      metadata spec, never static/templated
- [ ] Project / location / timeline browsing UI

## M3 — Search, Before/After, Basic Report — target 2026-10-02

- [ ] Keyword/tag search
- [ ] Before/after asset pair selection + visual comparison
- [ ] First version of the visual report, shaped per the problem owner's
      mockup (project header, before/after, activities, evidence counts,
      impact summary)

## M4 — Online Round Submission — deadline 2026-10-03

- [ ] Deployed (Netlify preferred; Vercel/Render/GitHub Pages as fallback)
- [ ] GitHub repo shared, README complete and accurate
- [ ] Live demo link verified end-to-end on a clean session
- [ ] Google Form (Cloudinary tools feedback) submitted
- [ ] Submitted via Hack Culture platform

*By this point only Core/Must-Have requirements are needed — M1–M4 alone
should produce a working, submittable product even in the worst case.*

## M5 — Verification Layer — target 2026-10-04 → 2026-10-06

- [ ] Field-photo pre-processing pass (enhance/sharpen/auto-orient) before
      AI tagging
- [ ] Consistency check: detected content vs. claimed project/location/
      stage/date → `verification_status`
- [ ] Duplicate/reuse detection (perceptual hash index)
- [ ] AI-described before/after change (not just an image pair)

## M6 — Impact Indicator Mapping — target 2026-10-07

- [ ] SDG indicator lookup table (activity/tag → indicator code)
- [ ] Per-project classification pass (LLM), with confidence + backing
      asset count per indicator
- [ ] Low-confidence indicators flagged for review, never silently asserted
- [ ] Surfaced in the report with click-through to backing assets

## M7 — Semantic Search & UI Polish — target 2026-10-08 → 2026-10-09

- [ ] Embedding-based semantic search (natural-language queries)
- [ ] Dark theme + connectome-inspired visual language applied
      (see [docs/UI_DIRECTION.md](docs/UI_DIRECTION.md))
- [ ] Evidence Graph secondary view, built on real data — not decorative
- [ ] Fonts applied once supplied

## M8 — Demo Prep & Hardening — target 2026-10-10

- [ ] Full walkthrough rehearsal against the pitch
- [ ] Bug pass: error states, empty states, slow-network behavior
- [ ] Seed a reliable demo dataset (Solar Village + at least one second
      project, to show multi-project support and indicator mapping variety)

## M9 — Offline Round — 2026-10-11

- [ ] Final presentation
- [ ] Submission finalized

---

## Sequencing Rationale

- M1–M4 cover Core/Must-Have only (see [REQUIREMENTS.md](REQUIREMENTS.md)),
  so there's a demoable, submittable product by the first deadline even in
  the worst case.
- M5–M7 are the differentiators (verification, indicator mapping, UI). They
  come *after* a working core on purpose — judging needs something to see
  first, and the differentiators only matter if the base product works.
- M7 (UI polish) is scheduled last among the differentiators deliberately —
  the organizers are explicit that judging weighs depth of Cloudinary
  integration over visual polish; the connectome UI is a strong pitch
  moment, not the thing carrying the submission.
