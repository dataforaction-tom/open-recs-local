'use client';

import { Line } from 'react-chartjs-2';
import { EmptyChart } from './empty-chart';
import './chart-setup';

export type CadenceRow = { bucket: string; count: number };

const MONTH_FMT = new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit' });

function formatBucket(iso: string): string {
  const d = new Date(iso);
  return MONTH_FMT.format(d);
}

const LINE_COLOR = 'oklch(0.68 0.14 75)';                 // ochre
const FILL_COLOR = 'oklch(0.68 0.14 75 / 0.18)';
const AXIS_COLOR = 'oklch(0.55 0.006 70)';
const GRID_COLOR = 'oklch(0.92 0.004 80)';

export function CadenceLine({ rows }: { rows: CadenceRow[] }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total === 0) return <EmptyChart label="No progress updates in the last 12 months." />;

  const data = {
    labels: rows.map((r) => formatBucket(r.bucket)),
    datasets: [
      {
        data: rows.map((r) => r.count),
        borderColor: LINE_COLOR,
        backgroundColor: FILL_COLOR,
        tension: 0.3,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: LINE_COLOR,
        pointBorderColor: LINE_COLOR,
      },
    ],
  };
  return (
    <div className="h-64">
      <Line
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { precision: 0, color: AXIS_COLOR, font: { family: 'var(--font-sans)' } },
              grid: { color: GRID_COLOR },
            },
            x: {
              ticks: { color: AXIS_COLOR, font: { family: 'var(--font-sans)' } },
              grid: { display: false },
            },
          },
        }}
      />
    </div>
  );
}
