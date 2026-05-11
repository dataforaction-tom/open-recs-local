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

const COLORS: Record<RecStatus, string> = {
  open: '#94a3b8',         // slate
  in_progress: '#4f46e5',  // indigo
  done: '#059669',         // emerald
  blocked: '#dc2626',      // red
  withdrawn: '#a3a3a3',    // neutral
};

export type StatusDonutRow = { status: RecStatus; count: number };

export function StatusDonut({ rows }: { rows: StatusDonutRow[] }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total === 0) return <EmptyChart label="No recommendations yet." />;

  // Pad missing statuses to zero so the legend is stable across pages.
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
        options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }}
      />
    </div>
  );
}
