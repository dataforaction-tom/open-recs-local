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

function buildColumns(
  onTransition: StatusTransitionAction,
): ColumnDef<RecommendationRow>[] {
  return [
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <button
        type="button"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="flex items-center gap-1 font-medium text-left"
      >
        Title
      </button>
    ),
    cell: ({ row }) => (
      <Link
        href={`/recommendations/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.title}
      </Link>
    ),
  },
  {
    accessorKey: 'sourceTitle',
    header: 'Source',
    cell: ({ row }) => (
      <Link
        href={`/sources/${row.original.sourceSlug}`}
        className="text-muted-foreground hover:text-foreground hover:underline"
      >
        {row.original.sourceTitle}
      </Link>
    ),
  },
  {
    accessorKey: 'latestStatus',
    header: 'Status',
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
      <button
        type="button"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="flex items-center gap-1 font-medium text-left"
      >
        Created
      </button>
    ),
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.createdAt.toLocaleDateString()}
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
      <div className="rounded-md border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        No recommendations match these filters yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="px-3 py-2 text-left">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
