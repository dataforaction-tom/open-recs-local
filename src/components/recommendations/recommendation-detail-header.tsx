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
    <header className="space-y-6">
      <div className="space-y-3">
        <div className="section-num">Recommendation</div>
        <h1 className="text-4xl tracking-tight">{title}</h1>
      </div>

      <p className="max-w-[58rem] font-serif text-lg leading-relaxed text-foreground/90">
        {body}
      </p>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-rule pt-4 text-sm">
        <span className="text-muted-foreground">Filed from</span>
        <Link
          href={`/sources/${sourceSlug}`}
          className="font-medium underline-offset-4 hover:text-accent hover:underline"
        >
          {sourceTitle}
        </Link>
        {pageAnchor !== null ? (
          <>
            <span aria-hidden className="text-muted-foreground">·</span>
            <Link
              href={`/sources/${sourceSlug}#page=${pageAnchor}`}
              className="text-muted-foreground underline-offset-4 hover:text-accent hover:underline"
            >
              Page {pageAnchor}
            </Link>
          </>
        ) : null}
      </div>
    </header>
  );
}
