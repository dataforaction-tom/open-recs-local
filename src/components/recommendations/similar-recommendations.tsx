import Link from 'next/link';
import type { SimilarRec } from '@/lib/repositories/recommendation';

export function SimilarRecommendations({ rows }: { rows: SimilarRec[] }) {
  if (rows.length === 0) {
    return (
      <p className="font-serif italic text-muted-foreground">
        No similar recommendations yet — embeddings may still be processing.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Ranked by embedding distance. Closer means more alike.
      </p>
      <ul className="divide-y divide-rule">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <Link
              href={`/recommendations/${row.id}`}
              className="text-base underline-offset-4 hover:text-accent hover:underline"
            >
              {row.title}
            </Link>
            <Link
              href={`/sources/${row.sourceSlug}`}
              className="font-serif text-sm italic text-muted-foreground underline-offset-4 hover:text-accent hover:underline"
            >
              {row.sourceSlug}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
