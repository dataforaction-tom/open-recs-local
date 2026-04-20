# Mistakes & Lessons Learned

Things that went wrong and what to do instead. This file is the most important feedback loop for improving Claude's performance on this project.

**How to use this file:**
- After every correction, add an entry here
- Tell Claude: "Add what just happened to MISTAKES.md so you don't repeat it"
- Periodically review and promote recurring patterns into CLAUDE.md as rules
- Delete entries that have been promoted to CLAUDE.md to avoid duplication

---

## Mistakes Log

### 2026-04-19 — Didn't sanity-check plan version references before executing
**What happened:** Started Task 0.1 trusting the plan's prose ("Next.js 15", "zod 3", `pnpm verify` as step-5 verification). In reality, `@latest` resolved to Next 16, zod 4 installed, and `pnpm verify` couldn't pass yet because it runs `pnpm test` which depends on vitest (not installed until Task 0.2). Also the plan referenced `.env.example` content at "design doc Section H" — a section that doesn't exist.
**Why it was wrong:** Surprise deviations mid-task cost extra cycles and force ad-hoc adaptations that should be design-time decisions. The user didn't get to choose whether to pin versions before work started.
**Rule:** At the start of plan execution (before Task 0.1), do a 2-minute pre-flight: (a) resolve `@latest` for each major dep the plan names and flag drift, (b) walk the verify/test script chain to catch ordering bugs like `verify` depending on a not-yet-installed tool, (c) cross-check any "see section X" references actually exist in the cited doc. Raise deltas with the user before committing time.

### 2026-04-19 — Installed latest vitest on Windows without checking ecosystem pairings
**What happened:** Ran `pnpm add -D vitest` (no version pin). Got vitest 4.1.4, which ships `rolldown@1.0.0-rc.15`. Its Windows native binding fails to load under pnpm. Two more reinstall cycles (vitest 3.2 + vite 7 CJS/ESM mismatch, then vite-tsconfig-paths 5 ESM-only) before landing on the stable combo.
**Why it was wrong:** On Windows, native-binding tooling is fragile. `@latest` is a coin flip. Three installs of ~50 packages each was wasted time.
**Rule:** When installing test / build tools with native deps on Windows, don't use `^` or `@latest` blind. Pin an explicit known-good combo up front. For this repo: `vitest@^3.1.0`, `@vitejs/plugin-react@^4`, `vite-tsconfig-paths@^5`, `vite@^6`. Config file must be `.mts` (vite-tsconfig-paths 5 is ESM-only and the package is not `"type": "module"`).

---

## Patterns That Didn't Work

Approaches we tried that turned out to be wrong for this project. Don't try these again.

<!--
### [Approach name]
**What we tried:** [Description]
**Why it failed:** [What went wrong]
**What works instead:** [The better approach]
-->

---

## Promoted to CLAUDE.md

Entries that have been moved into CLAUDE.md as permanent rules. Kept here for reference.

<!--
- [date]: [Rule summary] — moved to CLAUDE.md
-->
