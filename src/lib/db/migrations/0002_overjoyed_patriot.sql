-- Snapshot alignment: `sources.tsv` was already created as `tsvector` in 0001
-- (hand-edited at the time because drizzle 0.45 emitted it as `text`).
-- The schema now declares it via a `tsvector` customType, which causes
-- drizzle-kit to emit an ALTER TO tsvector. This is a runtime no-op (the
-- column is already tsvector), and drizzle-kit renders the target type as
-- `"undefined"."tsvector"` for customTypes without a schema qualifier — so we
-- replace that broken fragment with bare `tsvector`. The SET DATA TYPE is
-- retained so the migrations journal stays in sync with the snapshot.
ALTER TABLE "sources" ALTER COLUMN "tsv" SET DATA TYPE tsvector;