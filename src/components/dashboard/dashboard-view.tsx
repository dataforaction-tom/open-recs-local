'use client';

import Link from 'next/link';
import { DecisionFlow } from '@/components/decision-flow/decision-flow';

export type DashboardJob = {
  id: string;
  name: string;
  state: string;
  createdOn: Date;
  completedOn: Date | null;
};

export type DashboardSource = {
  id: string;
  slug: string;
  title: string;
  status: string;
  createdAt: Date;
};

function statusKey(raw: string): string {
  const s = raw.toLowerCase();
  if (s === 'ready' || s === 'completed') return 'done';
  if (s === 'failed' || s === 'cancelled') return 'failed';
  if (
    s === 'parsing' ||
    s === 'extracting' ||
    s === 'embedding' ||
    s === 'active' ||
    s === 'created' ||
    s === 'retry'
  )
    return 'in-progress';
  return 'pending';
}

function statusLabel(raw: string): string {
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ');
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function relTime(d: Date | null, now = Date.now()): string {
  if (!d) return '—';
  const diff = d.getTime() - now;
  const abs = Math.abs(diff);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < min) return 'just now';
  if (abs < hour) return RELATIVE.format(Math.round(diff / min), 'minute');
  if (abs < day) return RELATIVE.format(Math.round(diff / hour), 'hour');
  return RELATIVE.format(Math.round(diff / day), 'day');
}

export function DashboardView({
  recentJobs,
  recentSources,
}: {
  recentJobs: DashboardJob[];
  recentSources: DashboardSource[];
}) {
  return (
    <div className="space-y-12">
      <DecisionFlow />

      <header className="space-y-3">
        <div className="section-num">01 · Dashboard</div>
        <h1 className="text-4xl tracking-tight">Today’s readings</h1>
        <p className="max-w-[42rem] font-serif text-lg italic leading-relaxed text-foreground/85">
          A short brief on what the pipeline is doing and what landed
          recently. Click into a source to read it, or open a job to see
          where it got stuck.
        </p>
      </header>

      <div className="grid gap-10 md:grid-cols-2">
        {/* Recent jobs ----------------------------------------------- */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
            <h2 className="text-sm font-medium">Recent jobs</h2>
            <span className="text-sm text-muted-foreground">
              {recentJobs.length} shown
            </span>
          </div>

          {recentJobs.length === 0 ? (
            <p className="font-serif italic text-muted-foreground">
              No jobs yet. Upload a source to start the pipeline.
            </p>
          ) : (
            <ul className="divide-y divide-rule">
              {recentJobs.map((j) => (
                <li key={j.id} className="flex flex-col gap-1 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm">{j.name}</span>
                    <span
                      className="status shrink-0 text-xs"
                      data-state={statusKey(j.state)}
                    >
                      {statusLabel(j.state)}
                    </span>
                  </div>
                  <span className="ref tabular-nums">
                    {relTime(j.completedOn ?? j.createdOn)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent sources -------------------------------------------- */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
            <h2 className="text-sm font-medium">Recent sources</h2>
            <Link
              href="/sources"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-accent"
            >
              All sources
            </Link>
          </div>

          {recentSources.length === 0 ? (
            <p className="font-serif italic text-muted-foreground">
              No sources yet.{' '}
              <Link
                href="/sources"
                className="underline underline-offset-4 hover:text-accent"
              >
                Upload a PDF
              </Link>{' '}
              to begin.
            </p>
          ) : (
            <ul className="divide-y divide-rule">
              {recentSources.map((s) => (
                <li key={s.id} className="flex flex-col gap-1 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link
                      href={`/sources/${s.slug}`}
                      className="min-w-0 flex-1 truncate text-base underline-offset-4 hover:text-accent hover:underline"
                      title={s.title}
                    >
                      {s.title}
                    </Link>
                    <span
                      className="status shrink-0 text-xs"
                      data-state={statusKey(s.status)}
                    >
                      {statusLabel(s.status)}
                    </span>
                  </div>
                  <span className="ref tabular-nums">
                    {relTime(s.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
