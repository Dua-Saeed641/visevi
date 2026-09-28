# UI Direction

> Status: early — visual language only. Fonts and a full design system are
> not decided yet (owner will share fonts later). This is a design-intent
> doc, not a spec; revise freely as more references come in.

## Inspiration

Colorpong "Neurones" vector bundle (colorpong.com, commercial stock art) —
dark/black background with organic, radially-branching network line art:
fine curved lines fanning out from dense clusters to individually colored
node points, reading as a neuron/connectome structure. Reference images
supplied by the project owner, 2026-09-28.

**Licensing note:** the Colorpong bundle is paid stock artwork (~$5, for
Adobe Illustrator). It's inspiration for the visual *style* only — it should
not be embedded in the shipped product. VisEvi's own "neuron-style" visuals
should be generated/rendered from real evidence-graph data (see below), not
the purchased vector files.

## Visual Language

- **Background:** near-black, dark theme as the default aesthetic — not a
  toggle-able dark mode, the primary look.
- **Signature motif:** organic, radially-branching network graphs — curved
  edges (not straight lines), glowing node points, clusters fanning outward
  from denser centers.
- **Palette:** vivid, saturated multi-hue accents against black — red,
  orange, yellow, pink/magenta, blue-violet, cyan, green. Should be used to
  color-code meaningful categories (verification status, project type,
  indicator category) rather than applied decoratively/randomly.
- **Typography:** TBD — to be added once fonts are provided.

## Where This Applies in VisEvi

Maps onto two places already named in [../ARCHITECTURE.md](../ARCHITECTURE.md):

1. **Evidence Graph (secondary view)** — the knowledge-graph visualization
   discussed for the platform (nodes = assets/tags/projects/locations, edges
   = relationships: semantic similarity, shared project, before/after
   links). This is the literal, honest home for the connectome aesthetic —
   it's real data rendered in that visual style, not decoration.
2. **Landing / hero visual** — a procedurally generated radiating network as
   background art on the landing screen, tying "visual evidence
   intelligence" to the neuron/connectome metaphor without needing to
   over-explain it.

## Scoping Guidance

Carried over from prior discussion of the neuron/connectome concept — these
risks don't go away just because reference art now exists:

- **Hairball problem** — dense organic graphs stop being readable past a few
  hundred nodes. Keep this as a secondary/exploratory view; never make it
  the only way to navigate the app.
- **Performance** — a good force-directed/WebGL graph is expensive to render
  well. Budget real implementation time for it in M7 (see
  [../MILESTONES.md](../MILESTONES.md)); don't bolt it on last-minute.
- **Build time vs. judging weight** — organizers are judging depth of
  Cloudinary integration, not UI flash. This is deliberately sequenced
  *after* the verification layer and indicator mapping.
- **Accessibility** — dense animated graphs are hard to read for
  colorblind/low-vision users. Core flows (upload, search, report) must not
  depend on reading the graph.

## Open

- Fonts — pending, to be supplied by the project owner.
- Whether the landing-page network background is a one-time generated SVG or
  a live render of real (sampled/anonymized) evidence-graph data — leaning
  toward the latter since it's more honest to what the product does, revisit
  once render performance is measured.
