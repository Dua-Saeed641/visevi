# Problem Statement (Official)

> Source: Problem Statement 02 · Cloudinary — Geek Room hackathon.
> This document is a structured transcription of the original one-page problem
> statement PDF. Wording is preserved as closely as possible. Where this document
> organizes or labels content beyond what is explicitly written in the source, it
> is marked **[Design Interpretation]**.

## Title

**AI-Powered Impact & Sustainability Media Platform**

## Event

- 3 Oct — Online round
- 11 Oct — Offline round

## Problem

NGOs, governments, and sustainability organizations generate large volumes of
photos and videos from field projects, environmental initiatives, infrastructure
work, and community programs. Manually organizing, analyzing, verifying, and
turning this media into meaningful evidence and reports is time-consuming and
difficult to scale.

## Context

- Media originates from **field projects, environmental initiatives,
  infrastructure work, and community programs**.
- The organizations generating this media are **NGOs, governments, and
  sustainability organizations**.
- The current process (manual organization, analysis, verification, and
  reporting) does not scale with volume.

## Challenge

Build an AI-powered media intelligence platform **using Cloudinary** that can:

- Understand field media.
- Organize evidence by **project, location, and timeline**.
- Help teams turn visual data into reliable insights and impact stories.

## Goal — Required Capabilities

The platform must be able to:

1. Analyze and intelligently organize large collections of image and video
   evidence.
2. Identify relevant projects, activities, locations, and visual signals from
   media.
3. Compare before-and-after media to demonstrate visible project or
   environmental changes.
4. Make media searchable through AI-powered metadata, tagging, and semantic
   discovery.
5. Generate visual reports, summaries, and campaign-ready content from
   collected evidence.
6. Preserve traceability to the original source assets and transformations.

## Expected Outcome

> A scalable media intelligence product that transforms raw field media into
> searchable evidence, measurable impact, and compelling visual stories.

---

## Requirement Groupings

The source document presents the six goal bullets as a flat list. The groupings
below organize them by theme for implementation planning. **[Design
Interpretation]**

### Media Understanding / AI Analysis Requirements
- Analyze and intelligently organize large collections of image and video
  evidence (Goal 1).
- Identify relevant projects, activities, locations, and visual signals from
  media (Goal 2).

### Before/After & Temporal Requirements
- Compare before-and-after media to demonstrate visible project or
  environmental changes (Goal 3).

### Search & Metadata Requirements
- Make media searchable through AI-powered metadata, tagging, and semantic
  discovery (Goal 4).

### Reporting Requirements
- Generate visual reports, summaries, and campaign-ready content from
  collected evidence (Goal 5).

### Traceability Requirements
- Preserve traceability to the original source assets and transformations
  (Goal 6).

### Cloudinary-Related Requirements
- The platform must be built **using Cloudinary** — stated explicitly as the
  required media infrastructure in the challenge statement. The specific
  Cloudinary capabilities to use (upload, transformations, AI add-ons,
  metadata/tagging, search API, etc.) are not enumerated in the source and are
  a design decision — see [REQUIREMENTS.md](REQUIREMENTS.md) and
  [ARCHITECTURE.md](ARCHITECTURE.md). **[Design Interpretation]**

### Expected Media Workflow
Not explicitly specified step-by-step in the source document. The six goals
imply an ordered flow from raw media to reporting, which this project encodes
as the core product loop (see README.md). **[Design Interpretation]**

### Submission / Demo Requirements
Not stated in the original PDF beyond the two event dates. Clarified in the
organizer kickoff call (Cloudinary + Hack Culture, 2026-09-28) — see
[MEETING_NOTES.md](docs/MEETING_NOTES.md) for the full transcript:

- Submit via the **Hack Culture** platform: GitHub repo link + **live demo
  link** are both required.
- App must be **deployed** before submission — Netlify (preferred), Vercel,
  Render, or GitHub Pages, all free tier.
- A separate Google Form collects feedback on which Cloudinary tools were
  tried (not a judging input, but expected to be filled out).
- Cloudinary's free tier (no credit card) is confirmed sufficient to build a
  competitive submission.
- **Judging expectation (stated explicitly in Q&A):** Cloudinary integration
  must be **deep** — not just using Cloudinary as basic file storage. A
  project that only uploads/serves images through Cloudinary without using
  its AI/transformation/analysis capabilities is explicitly called out as
  under-using the platform.

---

## Notes

- The source PDF is a single page (page marker "02/03" in the footer refers to
  this being problem statement #2 of 3 offered at the event, not page 2 of a
  multi-page document).
- No technology stack, team size, timeline breakdown (beyond the two dates),
  or scoring rubric was specified in the source. All such details in this
  repository's other docs are proposed, not mandated.
