import Link from 'next/link';

export function RecommendationDetailHeader({
  title,
  body,
  sourceSlug,
  sourceTitle,
  pageAnchor,
}: {
  title: string;
  body: string;
  sourceSlug: string;
  sourceTitle: string;
  pageAnchor: number | null;
}) {
  return (
    <header className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-base leading-relaxed">{body}</p>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>From</span>
        <Link href={`/sources/${sourceSlug}`} className="font-medium text-foreground hover:underline">
          {sourceTitle}
        </Link>
        {pageAnchor !== null ? (
          <>
            <span aria-hidden>·</span>
            <Link
              href={`/sources/${sourceSlug}#page=${pageAnchor}`}
              className="hover:text-foreground hover:underline"
            >
              Page {pageAnchor}
            </Link>
          </>
        ) : null}
      </div>
    </header>
  );
}
