import { Badge } from '@/components/ui/badge';
import type { ProgressUpdateRow } from '@/lib/repositories/progress-update';

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
];

function relativeFromNow(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  for (const { unit, ms } of UNITS) {
    if (absMs >= ms) return RTF.format(Math.round(diffMs / ms), unit);
  }
  return 'just now';
}

export function ProgressUpdatesList({ rows }: { rows: ProgressUpdateRow[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
        <h3 className="text-sm font-medium">Progress updates</h3>
        <span className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-2 font-serif italic text-muted-foreground">
          No progress updates yet. Be the first to post one below.
        </p>
      ) : (
        <ol className="divide-y divide-rule">
          {rows.map((row) => (
            <li key={row.id} className="space-y-2 py-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <time
                  className="ref tabular-nums"
                  dateTime={row.createdAt.toISOString()}
                  title={row.createdAt.toLocaleString()}
                >
                  {relativeFromNow(row.createdAt)}
                </time>
                {row.authorName ? (
                  <span className="text-sm text-muted-foreground">
                    by {row.authorName}
                  </span>
                ) : row.authorUserId ? (
                  <span className="text-sm text-muted-foreground">by User</span>
                ) : null}
                {row.evidenceType && (
                  <Badge variant="outline">{row.evidenceType.name}</Badge>
                )}
                {row.userProgressRating && (
                  <Badge variant="active">{row.userProgressRating.name}</Badge>
                )}
              </div>
              <p className="whitespace-pre-wrap font-serif text-[0.98rem] leading-relaxed">
                {row.progressNotes}
              </p>
              {row.evidenceUrl && (
                <p className="text-sm">
                  <a
                    href={row.evidenceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent underline underline-offset-4 hover:text-foreground"
                  >
                    {row.evidenceUrl}
                  </a>
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
