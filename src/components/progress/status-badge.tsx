import { Badge } from '@/components/ui/badge';
import type { RecStatus } from '@/lib/db/schema';

const LABELS: Record<RecStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
  withdrawn: 'Withdrawn',
};

const VARIANTS: Record<RecStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open: 'outline',
  in_progress: 'default',
  done: 'secondary',
  blocked: 'destructive',
  withdrawn: 'outline',
};

export function StatusBadge({ status, title }: { status: RecStatus; title?: string }) {
  return (
    <Badge variant={VARIANTS[status]} title={title}>
      {LABELS[status]}
    </Badge>
  );
}
