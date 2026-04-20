# open-recs-local

open-recs-local is a tool for tracking and making sense of the recommendations inside inquiry reports, reviews, and evaluations. You drop in a PDF, it extracts every recommendation into its own record, and then you — or your stakeholders — track whether each one actually gets done over time.

It's a local-first rebuild of [Open Recommendations](https://github.com/dataforaction-tom/open-recommendations), designed to run on modest hardware with no cloud dependencies required. The same code base also runs as a multi-user hosted service.

## Who it's for

- **Charities and non-profits** wrestling with inquiry and evaluation reports, trying to hold themselves or others accountable for acting on what was recommended.
- **Regulators and inspectorates** producing a steady stream of reports and wanting to see the effect of what's been recommended across many organisations.
- **Researchers and policy teams** who need to compare, cluster, and search recommendations across a body of reports.
- **Anyone** who reads a lot of reports and wants to turn them from static documents into a live, queryable record.

## How it works, at a glance

1. **Upload a report.** A PDF or a URL.
2. **Automatic processing.** The document is OCR'd into clean markdown, each recommendation is extracted as a distinct item, and everything is indexed for search.
3. **Browse and search.** Recommendations appear in a searchable table. You can filter by source, theme, status, or date — or search conversationally with citations back to the original report.
4. **Track progress.** Stakeholders add updates against each recommendation: notes, evidence, a progress rating. This builds up a time series of implementation.
5. **See the bigger picture.** Network visualisations show which recommendations are similar across reports; thematic dashboards show progress by area.

## Two ways to run it

- **Local mode** — one person or one team, running on their own hardware. No sign-in, no user management, everything is yours.
- **Hosted mode** — a multi-user instance with sign-in, ownership flows for reports, admin controls, and privacy settings.

You choose with a single environment variable. The underlying code is the same.

## Status

This is an early-stage rebuild. The database schema, provider abstractions, and test infrastructure are in place. The user-facing features — upload, search, recommendations table, progress tracking, chat — are being built out phase by phase. Follow along in the [changelog](changelog.md).

## Getting started

See the [User Guide](user-guide.md) for setup and usage instructions.

## Need help?

Raise an issue on [GitHub](https://github.com/dataforaction-tom/open-recs-local/issues) or email tom@good-ship.co.uk.
