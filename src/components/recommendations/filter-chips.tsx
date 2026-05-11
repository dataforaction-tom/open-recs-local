'use client';

import { X } from 'lucide-react';

export type ActiveFilter = {
  key: string;
  label: string;
  value: string;
};

export function FilterChips({
  active,
  onClear,
}: {
  active: ActiveFilter[];
  onClear: (key: string) => void;
}) {
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-muted-foreground">Filters</span>
      {active.map((filter) => (
        <span
          key={filter.key}
          className="inline-flex items-center gap-1.5 border border-rule px-2.5 py-1 text-sm"
        >
          <span className="text-muted-foreground">{filter.label}:</span>
          <span>{filter.value}</span>
          <button
            type="button"
            aria-label={`Clear ${filter.label.toLowerCase()} filter`}
            onClick={() => onClear(filter.key)}
            className="ml-1 text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
    </div>
  );
}
