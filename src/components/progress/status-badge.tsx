import type { RecStatus } from '@/lib/db/schema';

const LABELS: Record<RecStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
  withdrawn: 'Withdrawn',
};

/**
 * Maps `RecStatus` onto the `data-state` keys recognised by the `.status`
 * class in globals.css. The dot indicator handles the colour cue (accent
 * for active/done, destructive for blocked, muted for withdrawn) without
 * shouting at the reader.
 */
function dataStateFor(status: RecStatus): string {
  switch (status) {
    case 'open':
      return 'pending';
    case 'in_progress':
      return 'in-progress';
    case 'done':
      return 'done';
    case 'blocked':
      return 'blocked';
    case 'withdrawn':
      return 'withdrawn';
  }
}

export function StatusBadge({ status, title }: { status: RecStatus; title?: string }) {
  return (
    <span className="status" data-state={dataStateFor(status)} title={title}>
      {LABELS[status]}
    </span>
  );
}
