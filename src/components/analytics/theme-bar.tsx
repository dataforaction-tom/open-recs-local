'use client';

import { Bar } from 'react-chartjs-2';
import { EmptyChart } from './empty-chart';
import './chart-setup';

export type ThemeBarRow = {
  slug: string;
  name: string;
  colorHex: string;
  count: number;
};

export function ThemeBar({ rows }: { rows: ThemeBarRow[] }) {
  if (rows.length === 0) return <EmptyChart label="No themed recommendations yet." />;
  const data = {
    labels: rows.map((r) => r.name),
    datasets: [
      {
        data: rows.map((r) => r.count),
        backgroundColor: rows.map((r) => r.colorHex),
        borderWidth: 0,
      },
    ],
  };
  return (
    <div className="h-64">
      <Bar
        data={data}
        options={{
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
        }}
      />
    </div>
  );
}
