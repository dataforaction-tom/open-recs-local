import type { StatusHistoryRow } from '@/lib/repositories/recommendation-status';
import { StatusBadge } from '@/components/progress/status-badge';

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

export function StatusTimeline({ rows }: { rows: StatusHistoryRow[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
        <h3 className="text-sm font-medium">Status history</h3>
        <span className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? 'change' : 'changes'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-2 font-serif italic text-muted-foreground">
          No status changes yet. Use the control above to set one.
        </p>
      ) : (
        <ol className="space-y-0">
          {rows.map((row, idx) => (
            <li
              key={row.id}
              className={[
                'relative pl-6 pb-5',
                // Left border acts as the timeline rail; the last item has no rail.
                idx === rows.length - 1 ? '' : 'border-l border-rule',
              ].join(' ')}
            >
              {/* Timeline node */}
              <span
                aria-hidden
                className={[
                  'absolute -left-px top-1 size-2 rounded-full bg-muted-foreground/40',
                  idx === 0 ? 'bg-accent' : '',
                ].join(' ')}
              />
              <div className="flex flex-wrap items-baseline gap-2">
                <StatusBadge status={row.status} />
                <time
                  className="ref tabular-nums"
                  dateTime={row.createdAt.toISOString()}
                  title={row.createdAt.toLocaleString()}
                >
                  {relativeFromNow(row.createdAt)}
                </time>
                {row.setByName ? (
                  <span className="text-sm text-muted-foreground">
                    by {row.setByName}
                  </span>
                ) : row.setByUserId ? (
                  <span className="text-sm text-muted-foreground">by User</span>
                ) : null}
              </div>
              {row.note && (
                <p className="mt-2 whitespace-pre-wrap font-serif text-[0.98rem] leading-relaxed text-muted-foreground">
                  {row.note}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}