# client/

VisEvi's frontend — React 19 + TypeScript + Vite, Tailwind CSS v4, React
Router. Dark theme by default; see [../docs/UI_DIRECTION.md](../docs/UI_DIRECTION.md)
for the visual language this is built toward.

## Setup

```bash
npm install
cp .env.example .env.local   # adjust VITE_API_BASE_URL if the API isn't on :4000
npm run dev
```

Requires the [server](../server/README.md) running for anything beyond the
empty-state UI.

## Structure

```
src/
├── components/   shared UI (Layout, nav)
├── pages/        route-level views (Dashboard, Upload)
├── lib/api.ts    typed fetch wrapper around the server API
```

## Scripts

- `npm run dev` — Vite dev server (port 5173)
- `npm run build` — type-check + production build
- `npm run lint` — Oxlint

See [../ARCHITECTURE.md](../ARCHITECTURE.md) for how this fits the rest of
the system.
