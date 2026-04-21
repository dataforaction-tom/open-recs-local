# Fixtures

Deterministic inputs + golden outputs consumed by the fake providers during tests.

## Layout

```
fixtures/
  sources/
    <stem>.pdf                      # synthetic PDF (checked in, byte-stable)
    <stem>.canonical.md             # expected OCR output for <stem>.pdf
    <stem>.recommendations.json     # expected LLM extraction for <stem>
```

A "fixture" is the triple `(pdf, canonical.md, recommendations.json)` sharing the same stem.

## Contract

### Fake OCR provider (`src/lib/providers/ocr/fake.ts`)

Given `parseDocument({ filename: '<stem>.pdf', bytes })` it ignores `bytes`, reads `<FIXTURES_DIR>/<stem>.canonical.md`, and splits on `\n---\n` to produce one `ParsedPage` per chunk.

### Fake LLM provider (`src/lib/providers/llm/fake.ts`)

`generateStructured({ key, schema })` first looks up `key` in the in-memory `structuredResponses` map. If there's no match it falls back to `<FIXTURES_DIR>/<key>.recommendations.json` and validates it against `schema`. Either way the input must be parseable by the provided Zod schema — fixtures are not trusted blindly.

### Directory resolution

Both fakes resolve the fixtures directory in this order:

1. Explicit `config.fixturesDir` passed to the factory (per-test override).
2. `process.env.FIXTURES_DIR`.
3. Default: `<cwd>/fixtures/sources`.

`FIXTURES_DIR` is deliberately *not* in the Zod env schema — it's a test-only knob, not production config.

## Regenerating PDFs

PDFs are checked in so tests don't depend on the build step. To regenerate:

```bash
pnpm fixtures:build
```

The build script (`scripts/build-fixtures.ts`) uses `pdf-lib` with fixed creation/modification dates and the standard Helvetica font so output is byte-stable across runs. Edit the `FIXTURES` array in that script to change content, then re-run the command and commit the updated PDFs alongside any sidecar edits.

## Adding a new fixture

1. Add an entry to `FIXTURES` in `scripts/build-fixtures.ts`.
2. Run `pnpm fixtures:build`.
3. Hand-author the matching `<stem>.canonical.md` and `<stem>.recommendations.json`.
4. Use `thematic_area_slug` values from `seeds/taxonomy.ts` (`governance`, `operations`, `finance`, `safeguarding`, `engagement`).
5. Commit the PDF + sidecars together.
