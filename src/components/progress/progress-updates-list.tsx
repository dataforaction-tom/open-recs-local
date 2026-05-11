import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        No progress updates yet — be the first to post one.
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {rows.map((row) => (
        <li key={row.id}>
          <Card>
            <CardContent className="space-y-2 pt-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <time
                  dateTime={row.createdAt.toISOString()}
                  title={row.createdAt.toLocaleString()}
                >
                  {relativeFromNow(row.createdAt)}
                </time>
                {row.evidenceType && (
                  <Badge variant="outline">{row.evidenceType.name}</Badge>
                )}
                {row.userProgressRating && (
                  <Badge variant="secondary">{row.userProgressRating.name}</Badge>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm">{row.progressNotes}</p>
              {row.evidenceUrl && (
                <p className="text-xs">
                  <a
                    href={row.evidenceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-muted-foreground underline hover:text-foreground"
                  >
                    {row.evidenceUrl}
                  </a>
                </p>
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}
