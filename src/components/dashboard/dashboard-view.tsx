'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export function DashboardView({
  recentJobs,
  recentSources,
}: {
  recentJobs: DashboardJob[];
  recentSources: DashboardSource[];
}) {
  return (
    <div className="space-y-6">
      <DecisionFlow />
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {recentJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentJobs.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-4">
                    <span className="font-mono text-xs text-muted-foreground">{j.name}</span>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{j.state}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent sources</CardTitle>
          </CardHeader>
          <CardContent>
            {recentSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sources yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentSources.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-4">
                    <span className="truncate">{s.title}</span>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{s.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
