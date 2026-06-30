import Link from 'next/link';

/**
 * Shown on search, chat, and recommendations when the corpus has no sources
 * yet. The `hasSources` flag is computed server-side via `listRecentSources`
 * (limit 1) and passed down so this component stays presentational.
 */
export function EmptyCorpusNotice() {
  return (
    <p className="font-serif text-base italic text-muted-foreground">
      No sources yet.{' '}
      <Link
        href="/sources"
        className="text-accent underline-offset-4 hover:underline"
      >
        Upload a PDF on the Sources page
      </Link>{' '}
      to get started.
    </p>
  );
}