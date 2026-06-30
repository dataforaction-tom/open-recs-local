import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

const CONFIDENCE_VARIANT: Record<
  NonNullable<RecommendationDetailHeaderProps['confidence']>,
  'default' | 'secondary' | 'outline'
> = {
  high: 'default',
  medium: 'secondary',
  low: 'outline',
};

type RecommendationDetailHeaderProps = {
  title: string;
  body: string;
  sourceSlug: string;
  sourceTitle: string;
  pageAnchor: number | null;
  confidence?: 'high' | 'medium' | 'low' | null;
  targetOrganization?: string | null;
  priorityTimescaleName?: string | null;
  notes?: string | null;
};

export function RecommendationDetailHeader({
  title,
  body,
  sourceSlug,
  sourceTitle,
  pageAnchor,
  confidence = null,
  targetOrganization = null,
  priorityTimescaleName = null,
  notes = null,
}: RecommendationDetailHeaderProps) {
  return (
    <header className="space-y-6">
      <div className="space-y-3">
        <div className="section-num">Recommendation</div>
        <h1 className="text-4xl tracking-tight">{title}</h1>
        {confidence ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={CONFIDENCE_VARIANT[confidence]}>
              Confidence: {confidence}
            </Badge>
            {targetOrganization ? (
              <Badge variant="outline">Target: {targetOrganization}</Badge>
            ) : null}
            {priorityTimescaleName ? (
              <Badge variant="outline">Timescale: {priorityTimescaleName}</Badge>
            ) : null}
          </div>
        ) : (
          (targetOrganization || priorityTimescaleName) && (
            <div className="flex flex-wrap items-center gap-2">
              {targetOrganization ? (
                <Badge variant="outline">Target: {targetOrganization}</Badge>
              ) : null}
              {priorityTimescaleName ? (
                <Badge variant="outline">Timescale: {priorityTimescaleName}</Badge>
              ) : null}
            </div>
          )
        )}
      </div>

      <p className="max-w-[58rem] font-serif text-lg leading-relaxed text-foreground/90">
        {body}
      </p>

      {notes ? (
        <div className="max-w-[58rem] border-l-2 border-rule pl-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Notes: </span>
          {notes}
        </div>
      ) : null}

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
