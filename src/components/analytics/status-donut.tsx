'use client';

import { Doughnut } from 'react-chartjs-2';
import { REC_STATUS, type RecStatus } from '@/lib/db/schema';
import { EmptyChart } from './empty-chart';
import './chart-setup';

const LABELS: Record<RecStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
  withdrawn: 'Withdrawn',
};

/**
 * Editorial palette echoes the `.status` indicator dots used elsewhere
 * in the app — same hues so the donut reads like a colour key for the
 * status pills above it.
 */
const COLORS: Record<RecStatus, string> = {
  open: 'oklch(0.58 0.08 320)',           // mauve — pending
  in_progress: 'oklch(0.68 0.14 75)',     // ochre
  done: 'oklch(0.58 0.10 145)',           // moss
  blocked: 'oklch(0.50 0.14 18)',         // claret
  withdrawn: 'oklch(0.74 0.006 75)',      // muted grey
};

export type StatusDonutRow = { status: RecStatus; count: number };

export function StatusDonut({ rows }: { rows: StatusDonutRow[] }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total === 0) return <EmptyChart label="No recommendations yet." />;

  const byStatus = new Map(rows.map((r) => [r.status, r.count]));
  const data = {
    labels: REC_STATUS.map((s) => LABELS[s]),
    datasets: [
      {
        data: REC_STATUS.map((s) => byStatus.get(s) ?? 0),
        backgroundColor: REC_STATUS.map((s) => COLORS[s]),
        borderWidth: 0,
      },
    ],
  };

  return (
    <div className="h-64">
      <Doughnut
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: {
              position: 'right',
              labels: {
                font: { family: 'var(--font-sans), system-ui, sans-serif', size: 12 },
                color: 'oklch(0.30 0.006 70)',
                boxWidth: 10,
                boxHeight: 10,
                padding: 12,
              },
            },
          },
        }}
      />
    </div>
  );
}
