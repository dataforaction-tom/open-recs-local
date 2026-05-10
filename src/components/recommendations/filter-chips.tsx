'use client';

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
    <div className="flex flex-wrap items-center gap-2">
      {active.map((filter) => (
        <Badge key={filter.key} variant="secondary" className="gap-1">
          <span>
            {filter.label}: {filter.value}
          </span>
          <button
            type="button"
            aria-label={`Clear ${filter.label.toLowerCase()} filter`}
            onClick={() => onClear(filter.key)}
            className="ml-1 rounded hover:bg-foreground/10"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}
