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

export function CadenceLine({ rows }: { rows: CadenceRow[] }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total === 0) return <EmptyChart label="No progress updates in the last 12 months." />;

  const data = {
    labels: rows.map((r) => formatBucket(r.bucket)),
    datasets: [
      {
        data: rows.map((r) => r.count),
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.2)',
        tension: 0.3,
        fill: true,
        pointRadius: 3,
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
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        }}
      />
    </div>
  );
}
