# Requirements

Derived from [PROBLEM_STATEMENT.md](PROBLEM_STATEMENT.md). Organized as an
implementation checklist. Nothing below is implemented yet — see
[README.md](README.md) → Current Project Status.

Priority tiers:
- **Core / Must Have** — required to satisfy the problem statement's stated
  goal; without these the submission does not address the challenge.
- **Important** — strongly supports the concept and expected outcome; a judge
  evaluating against the problem statement would expect to see these.
- **Enhancement** — adds polish or breadth; build only if time permits.

---

## Core / Must Have

- [ ] **Media ingestion** — upload images and video to Cloudinary (single
      asset and batch upload).
- [ ] **AI media understanding** — automatically extract tags, labels,
      objects, and scene descriptions from uploaded media (Cloudinary AI
      add-ons and/or an external vision model).
- [ ] **Project / location / timeline organization** — every asset is
      associated with a project, a location, and a capture timestamp, and can
      be browsed along those three axes.
- [ ] **Structured metadata storage** — persist AI-derived observations and
      user-provided context as structured, queryable metadata (not just free
      text).
- [ ] **Before/after comparison with AI-described change** — select two+
      assets from the same project/location and get both a visual comparison
      and an AI-generated description of what changed (not just the images
      side by side).
- [ ] **Search** — find media by keyword/tag metadata at minimum; semantic
      (meaning-based, natural-language) search is part of the stated goal.
- [ ] **Traceability** — every derived/transformed asset, insight, and report
      item links back to its original Cloudinary source asset (public ID,
      version, transformation history). Called out as a hard requirement.
- [ ] **Basic report/summary generation** — produce a visual summary (e.g. a
      project impact report) assembled from selected evidence.
- [ ] **Content-claim consistency check** — verify AI-detected content against
      the asset's claimed project/location/stage/date; flag mismatches
      instead of accepting metadata at face value. This is VisEvi's core
      differentiator — see [Differentiator](#differentiator-verified-evidence-not-just-organized-evidence) below.
- [ ] **Field-photo pre-processing pipeline** — auto-enhance/sharpen/straighten
      (via Cloudinary transformations) blurry or motion-affected field photos
      *before* they hit the AI analyzer, so detection quality holds up on
      typical phone-camera field shots.

## Important

- [ ] **Semantic search** (beyond tag/keyword matching) — e.g. embedding-based
      similarity search over media descriptions.
- [ ] **Activity/signal identification** — surface *what is happening* in the
      media (activities, visual signals), not just object labels.
- [ ] **Campaign-ready content export** — generate shareable, formatted output
      (e.g. exportable image/PDF summary) suitable for external communication.
- [ ] **Timeline view per project/location** — a chronological view of all
      evidence for a given project or site.
- [ ] **Transformation history visibility** — show what Cloudinary
      transformations were applied to a given derived asset.
- [ ] **Multi-project support** — the platform manages more than one
      project/organization at a time, not a single hardcoded dataset.
- [ ] **Duplicate/reuse detection** — perceptual-hash matching across the
      library to catch a photo recycled from a different project or an
      earlier report period.
- [ ] **Impact indicator auto-mapping** — classify each project's detected
      activities/tags against recognized development-sector indicator
      frameworks (UN SDG targets at minimum, e.g. "solar panel installation"
      → SDG 7.1 / SDG 13) and surface it in the report. See
      [New/Unique Feature](#new-unique-feature-impact-indicator-auto-mapping) below.

## Enhancement

- [ ] **Automated before/after pair detection** — system suggests likely
      before/after pairs instead of requiring manual selection.
- [ ] **Natural-language report generation** — LLM-authored narrative summary
      text alongside the visual report.
- [ ] **Role-based access / multi-org support** — separate data and
      permissions per organization.
- [ ] **Geo-mapping view** — plot evidence on a map by location.
- [ ] **Tamper-evident provenance chain** — hash-chain the audit log of
      uploads/edits (asset hash + Cloudinary public_id/version + timestamp)
      so a record can't be silently altered after field capture. Cheap to add
      once the verification layer and MongoDB audit trail exist.
- [ ] **Auto-narrated progress video** — stitch a project's timeline (stills +
      clips) into a narrated summary video via Cloudinary's video API,
      voiced from the LLM-generated impact summary (StudyO-style pattern from
      the kickoff call, applied to field evidence instead of lecture slides).
- [ ] **Public share links** for a generated report.
- [ ] **Bulk import** from external sources (e.g. cloud storage folder, CSV
      manifest with metadata).

---

## Differentiator: Verified Evidence, Not Just Organized Evidence

The original problem statement names three pain points — organizing,
analyzing, **verifying** — but the six goal bullets only operationalize the
first two. Every team at this hackathon will build roughly the same thing:
gallery + AI tags + before/after slider + PDF export. The unaddressed
"verify" pain point, plus the organizers' own Q&A guidance that judging
rewards *deep* Cloudinary use over basic storage, is where VisEvi
differentiates. Concretely:

1. **Consistency check** — does the AI-detected content of an asset actually
   match what it's filed under (project/location/stage/date)? Mismatches are
   flagged, not silently trusted.
2. **Duplicate/reuse detection** — perceptual hashing catches a photo reused
   across projects or reporting periods, a real donor-fraud pattern in NGO
   impact reporting.
3. **Robust detection on bad field photos** — a Cloudinary pre-processing
   pass (enhance/sharpen/auto-orient) before AI tagging, so quality doesn't
   collapse on typical blurry/motion phone-camera field shots.
4. **AI-described before/after change**, not a bare image pair — e.g. "68% of
   rooftop now paneled vs. 12% in January," generated from the diff.
5. Every signal above is traceable to the exact Cloudinary asset/version that
   produced it, feeding a **"verified activities"** count in the report —
   which is literally what the problem owner's own report mockup already
   shows (see Design Specifications below), just not yet explained by where
   that number comes from.

This uses Cloudinary across transformations, AI add-ons, structured metadata,
and versioning — not just as a file store — directly matching the stated
judging bar.

## New/Unique Feature: Impact Indicator Auto-Mapping

A second, additive differentiator, aimed at a real and expensive pain point
in the NGO/development sector rather than a generic media-AI feature:

**The problem:** NGOs and development orgs report progress against
standardized indicator frameworks — most commonly the **UN Sustainable
Development Goals (SDGs)** and project-specific log-frame/M&E indicators —
because that's what donors and governments require. Today, someone manually
looks through a folder of field photos and writes, by hand, "this evidence
supports SDG 7.1 (access to clean energy)." It's slow, inconsistent between
reporters, and invisible to any generic photo-organizing tool.

**The feature:** maintain a small curated mapping table (activity/tag →
SDG target / indicator code) and have the LLM classify each project's
aggregated tags/activities against it automatically. A "Solar Village"
project whose evidence clusters around `solar panel installation`,
`renewable-energy`, `construction` would automatically surface:

```
This project's evidence supports:
  SDG 7.1 — Access to affordable, reliable, modern energy services
  SDG 13.2 — Integrate climate measures into planning
```

with a click-through to the exact assets backing each indicator (traceability
again). No generic "organize your photos" platform does this — it requires
domain-specific taxonomy, which is exactly the kind of judge-legible, "why
does this exist and who needs it" feature that's hard to fake in a demo. It's
also cheap to build: a static mapping table + one LLM classification call per
project, no new infrastructure.

**A messier, more realistic example** — showing why this needs to carry
confidence and evidence counts, not just flat labels — a mangrove
restoration project with mixed evidence:

```
Input: 340 photos + 12 videos, "Coastal Village B — Mangrove Restoration"

Aggregated activity clusters:
  seedling planting ............... 142 assets
  nursery preparation .............  38 assets
  community training session ......  21 assets
  shoreline erosion (before state) .  19 assets
  fish/crab sighting near roots ....   9 assets
```

Classified output — deliberately not a single flat tag:

```
This project's evidence supports:

  SDG 14.2 — Sustainably manage and protect marine/coastal ecosystems
    confidence: high · backed by 180 assets (planting, nursery, shoreline)

  SDG 13.1 — Strengthen resilience to climate-related hazards
    confidence: medium · backed by 19 assets (erosion "before" state only —
    no matching "after" evidence yet, so this is a partial claim)

  SDG 8.5 / community livelihood
    confidence: low · backed by 21 assets (training sessions alone aren't
    strong evidence of an economic outcome — flagged for human review,
    not asserted in the final report)
```

The important design decision is the third line: the classifier must be able
to **decline to assert** an indicator when the backing evidence is thin,
rather than dumping every plausible SDG tag onto the report to look
impressive. That's the same verification discipline as the rest of the
platform (don't silently trust a claim, show confidence, stay traceable to
exactly which assets back it) applied to reporting instead of individual
assets — a judge clicking into "SDG 13.1" should land on the 19 actual
before-photos, not a black box.

## Design Specifications (from problem-owner's own analysis)

These come directly from notes the problem owner wrote while analyzing the
brief — not from the original PDF, but treated as authoritative intent since
they were produced by the person defining this project. Full source:
[docs/MEETING_NOTES.md](docs/MEETING_NOTES.md) and conversation history.

- **Detection robustness is explicit, not assumed.** Field photos are often
  blurry or motion-affected; the AI analyzer must still produce usable
  detections. Study how Google Photos handles this (its on-device/backend
  detection pipeline tolerates blur, poor lighting, motion) as a reference
  point when choosing/tuning the detection approach.
- **Metadata must be dynamically generated per asset, never static/templated.**
  Every asset's metadata should cover the major keywords relevant to it.
  Reference shape:
  ```json
  {
    "project": "Solar Village",
    "objects": ["solar panel", "worker", "building"],
    "activity": "solar panel installation",
    "location": "Village A",
    "stage": "installation",
    "tags": ["renewable-energy", "construction", "solar"]
  }
  ```
- **Semantic search must answer natural-language queries**, e.g. *"Show me
  pictures where renewable energy infrastructure was being installed"*
  should match content described as solar panels / solar installation /
  workers installing photovoltaic panels / renewable energy project — i.e.
  concept-level matching, not keyword overlap alone.
- **Before/after must include AI-detected change description**, not just a
  side-by-side image pair (e.g. Jan vs. March) — the model should articulate
  *what* changed.
- **Visual report is campaign-ready and specifically shaped like:**
  ```
  SOLAR VILLAGE PROJECT
  ────────────────────────
  Location: Village A          Duration: Jan – Mar 2026

  PROJECT PROGRESS
  Before          After
  [image]         [image]

  ACTIVITIES
  Solar installation ✓
  Infrastructure work ✓
  Community deployment ✓

  VISUAL EVIDENCE
  247 photos · 18 videos · 32 verified activities

  IMPACT SUMMARY
  Solar infrastructure was installed across the documented project area.
  ```
  Note the report mockup itself says **"verified activities"** — the report
  is expected to surface a verification signal per activity, not just a
  count of assets.
- **Traceability must be maintained at all cost** — every insight in a report
  must be traceable back to the original media that produced it. This is
  called out as a hard requirement, not a nice-to-have.

## Open Questions (not specified in the problem statement)

Resolved by the 2026-09-28 organizer kickoff call — see
[docs/MEETING_NOTES.md](docs/MEETING_NOTES.md):

- ~~Submission format and deliverables~~ → **Resolved:** Hack Culture
  platform submission, GitHub repo link + live demo link required, app must
  be deployed (Netlify preferred / Vercel / Render / GitHub Pages) before
  submission.
- ~~Judging criteria~~ → **Partially resolved:** no formal rubric was shared,
  but the organizers explicitly stated Cloudinary integration must be
  **deep** (AI add-ons, transformations, analysis), not basic storage/CDN
  usage. Treat that as a judging signal.

Still open:

- Whether a specific dataset will be provided, or teams source their own
  field media.
- Any constraint on which Cloudinary plan/tier is available (affects which AI
  add-ons — e.g. Google Cloud Vision add-on — are usable). Free tier is
  confirmed sufficient per the organizers.
- Formal judging rubric / scoring weights — not shared beyond the "deep
  integration" guidance above.
