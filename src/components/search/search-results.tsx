import Link from 'next/link';
import type { RrfRow } from '@/lib/services/search-sql';

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/**
 * Excerpt strategy: take the first sentence-ish chunk of body so results
 * read like a list of leads rather than dumping the full recommendation.
 */
function excerpt(body: string, max = 220): string {
  const trimmed = body.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
}

function RankChip({ label, rank }: { label: string; rank: number | null }) {
  if (rank === null) return null;
  return (
    <span className="font-mono text-[0.7rem] uppercase tracking-wide text-muted-foreground">
      {label} #{rank}
    </span>
  );
}

export function SearchResults({
  rows,
  mode,
}: {
  rows: RrfRow[];
  mode: 'hybrid' | 'keyword';
}) {
  if (rows.length === 0) {
    return (
      <p className="font-serif text-sm italic text-muted-foreground">
        No matches. Try a broader phrase or switch to{' '}
        {mode === 'hybrid' ? 'keyword' : 'hybrid'} mode.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {rows.map((row) => (
        <li key={row.id} className="space-y-2 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <Link
              href={`/recommendations/${row.id}`}
              className="text-base font-medium underline-offset-4 hover:text-accent hover:underline"
            >
              {row.title}
            </Link>
            <Link
              href={`/sources/${row.sourceSlug}`}
              className="font-serif text-sm italic text-muted-foreground underline-offset-4 hover:text-accent hover:underline"
            >
              {row.sourceTitle}
            </Link>
          </div>
          <p className="font-serif text-[0.95rem] leading-relaxed text-foreground">
            {excerpt(row.body)}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="ref tabular-nums text-muted-foreground">
              {SHORT_DATE.format(row.createdAt)}
            </span>
            <RankChip label="kw" rank={row.keywordRank} />
            <RankChip label="vec" rank={row.vectorRank} />
            {row.rrfScore !== null && (
              <span className="font-mono text-[0.7rem] uppercase tracking-wide text-accent">
                rrf {row.rrfScore.toFixed(4)}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
