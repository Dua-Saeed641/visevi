# Organizer Kickoff Call — Notes

> Cloudinary + Hack Culture hackathon kickoff, 2026-09-28. Captured here for
> reference. Actionable items are reflected in
> [../PROBLEM_STATEMENT.md](../PROBLEM_STATEMENT.md) (submission/demo
> requirements) and [../REQUIREMENTS.md](../REQUIREMENTS.md) (open questions).

## Action Items

- [ ] Submit project via the Hack Culture platform, including a GitHub link and a live demo link
- [ ] Deploy the app using GitHub Pages, Netlify, Vercel, or Render before submission
- [ ] Join Cloudinary Discord via community.cloudinary.com, `#Hackathons` channel, for support
- [ ] Fill out the Google Form giving feedback on Cloudinary tools tried
- [ ] (Optional) Join the Cloudinary Creators interest list at community.cloudinary.com
- [ ] Read: *How to Win a Hackathon* — https://dev.to/cloudinary/how-to-win-a-hackathon-1377

## Submission Process

- Submit via **Hack Culture** (the hackathon's own platform), then share the link with Cloudinary.
- Required: GitHub repo link + live demo link.
- Hosting: **Netlify preferred**, or Vercel / Render / GitHub Pages — all free tier.
- Cloudinary's free tier (no credit card required) is confirmed sufficient to build a winning project; a second account is a last resort only if credits run out (ping Discord first).

## Tooling Demoed (optional accelerators, not required)

- **React AI Starter Kit** — CLI that scaffolds React+TS with Cloudinary pre-configured; copy-paste prompts for AI coding assistants (e.g. Cursor) to add overlays/upload widgets correctly. Next.js version also available.
- **Cloudinary Skills Pack** (`cloudinary-devs/skills`) — text files added to an IDE/AI assistant giving it structured Cloudinary knowledge (Docs, React, Transformations skills) to reduce hallucination. Framework-agnostic — if not using React/Next, copy the underlying prompts and specify your framework (e.g. Astro, Vue).
- Any tech stack is acceptable; the starter kits are optional accelerators, not a requirement.

## Prizes

- Winner: ₹30,000 INR Amazon India gift card **per teammate** (up to 4).
- Runner-up: ₹20,000 INR total for the team.
- Delivered as gift cards (international cash-transfer constraints).

## Q&A — Key Points

**Problem statement & Cloudinary integration**
- The task is to integrate Cloudinary deeply into the *given* problem statement — not to pick an unrelated topic.
- Any app using media (image/audio/video) is a chance to showcase Cloudinary.
- Integration must be deep: AI add-ons, transformations, analysis — not just storage/CDN.
- Example given by presenter: an infrastructure-monitoring app using images to detect trees encroaching on power lines and pre-emptively alert fire departments.

**AI add-ons & free tier**
- Many AI add-ons live under the Add-ons section of the Cloudinary dashboard.
- Generative AI transformations are available but may have usage limits — ping Discord if credits run out.

**Internships/careers** (not project-relevant) — no current internship openings; occasional contractor roles on the Cloudinary Careers page.

## Tips for Winning (presenter guidance)

- Talk to prospective users before building; get feedback early.
- Polish and the pitch matter as much as the build — be ready to explain the problem and the solution clearly.
- Real user research is a differentiator judges reward.
- UN Sustainable Development Goals are a good source of framing/inspiration: https://sdgs.un.org/goals
- Referenced past winning hacks:
  - A gamified litter-cleanup app: blockchain points, crowdsourcing, image recognition.
  - **StudyO** (progressed to Y Combinator) — extracted text from professors' slide decks stored in Cloudinary, then used Cloudinary video to stitch the slides into a narrated video walkthrough. General pattern worth noting: *turn a stored document/image pipeline into a video output via Cloudinary's video API* — see https://www.studystudio.us/

## Reference Links

- Cloudinary hackathons hub: https://cloudinary.com/pages/hackathons/
- Skills pack repo: `cloudinary-devs/skills`
- How to Win a Hackathon: https://dev.to/cloudinary/how-to-win-a-hackathon-1377
- UN SDGs: https://sdgs.un.org/goals
- StudyO: https://www.studystudio.us/
- Kickoff slides: https://docs.google.com/presentation/d/1mB-HGpPbnAyVGwOuh9LfSigH9GWgG1dEA9sREphoLjw/edit
