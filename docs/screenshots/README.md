# Screenshots

The README references three PNGs:

- `dashboard.png` — `/dashboard` with recent jobs + recent sources cards.
- `source-viewer.png` — `/sources/<slug>` with the split-pane open on a public fixture source.
- `recommendations.png` — `/recommendations` with a filter applied.

Capture against the running dev stack:

```bash
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Then screenshot from a viewport that's at least `md:` wide (≥768px) so the split-pane viewer renders side-by-side.
