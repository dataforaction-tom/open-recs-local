'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { REC_STATUS, type RecStatus } from '@/lib/db/schema';
import type { StatusTransitionInputT } from '@/lib/validation/progress-update';
import { EditableSelectCell } from './editable-select-cell';
import { StatusBadge } from '@/components/progress/status-badge';

export type RecommendationRow = {
  id: string;
  title: string;
  sourceSlug: string;
  sourceTitle: string;
  createdAt: Date;
  latestStatus: RecStatus;
};

export type StatusTransitionAction = (
  input: StatusTransitionInputT,
) => Promise<{ ok: true } | { ok: false; error: string }>;

const STATUS_LABELS: Record<RecStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
  withdrawn: 'Withdrawn',
};

const STATUS_OPTIONS = REC_STATUS.map((s) => ({ value: s, label: STATUS_LABELS[s] }));

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function SortHint({ dir }: { dir: false | 'asc' | 'desc' }) {
  if (!dir) return null;
  return (
    <span className="ml-1 text-accent" aria-hidden>
      {dir === 'asc' ? '↑' : '↓'}
    </span>
  );
}

function HeaderButton({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active: false | 'asc' | 'desc';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center text-left text-sm font-medium hover:text-accent"
    >
      {children}
      <SortHint dir={active} />
    </button>
  );
}

function buildColumns(
  onTransition: StatusTransitionAction,
): ColumnDef<RecommendationRow>[] {
  return [
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <HeaderButton
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          active={column.getIsSorted()}
        >
          Recommendation
        </HeaderButton>
      ),
      cell: ({ row }) => (
        <Link
          href={`/recommendations/${row.original.id}`}
          className="text-[1rem] leading-snug underline-offset-4 hover:text-accent hover:underline"
        >
          {row.original.title}
        </Link>
      ),
    },
    {
      accessorKey: 'sourceTitle',
      header: () => <span className="text-sm font-medium">Source</span>,
      cell: ({ row }) => (
        <Link
          href={`/sources/${row.original.sourceSlug}`}
          className="font-serif text-[0.95rem] italic text-muted-foreground underline-offset-4 hover:text-accent hover:underline"
        >
          {row.original.sourceTitle}
        </Link>
      ),
    },
    {
      accessorKey: 'latestStatus',
      header: () => <span className="text-sm font-medium">Status</span>,
      cell: ({ row }) => (
        <EditableSelectCell<RecStatus>
          value={row.original.latestStatus}
          options={STATUS_OPTIONS}
          onSubmit={(next) =>
            onTransition({ recommendationId: row.original.id, status: next })
          }
          render={(value) => <StatusBadge status={value} />}
        />
      ),
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <HeaderButton
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          active={column.getIsSorted()}
        >
          Filed
        </HeaderButton>
      ),
      cell: ({ row }) => (
        <span className="ref tabular-nums">
          {SHORT_DATE.format(row.original.createdAt)}
        </span>
      ),
    },
  ];
}

type Props = {
  rows: RecommendationRow[];
  onStatusTransition: StatusTransitionAction;
};

export function RecommendationsTable({ rows, onStatusTransition }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const columns = useMemo(() => buildColumns(onStatusTransition), [onStatusTransition]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (rows.length === 0) {
    return (
      <p className="py-12 text-center font-serif text-base italic text-muted-foreground">
        No recommendations match these filters yet.
      </p>
    );
  }

  return (
    <table className="w-full">
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id} className="border-b border-rule">
            {headerGroup.headers.map((header) => (
              <th key={header.id} className="px-3 py-3 text-left align-bottom">
                {flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr
            key={row.id}
            className="border-b border-rule transition-colors hover:bg-paper-2"
          >
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} className="px-3 py-4 align-baseline">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
