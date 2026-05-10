import Link from 'next/link';
import type { SimilarRec } from '@/lib/repositories/recommendation';

export function SimilarRecommendations({ rows }: { rows: SimilarRec[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No similar recommendations yet — embeddings may still be processing.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-4">
          <Link
            href={`/recommendations/${row.id}`}
            className="text-sm font-medium hover:underline"
          >
            {row.title}
          </Link>
          <Link
            href={`/sources/${row.sourceSlug}`}
            className="text-xs text-muted-foreground hover:underline"
          >
            {row.sourceSlug}
          </Link>
        </li>
      ))}
    </ul>
  );
}
