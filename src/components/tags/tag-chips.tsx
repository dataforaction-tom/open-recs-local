import { cn } from '@/lib/utils';

export type TagChipsItem = {
  slug: string;
  name: string;
  colorHex: string | null;
  unverified: boolean;
};

type Props = {
  tags: ReadonlyArray<TagChipsItem>;
  className?: string;
};

/**
 * Read-only chip list. Verified tags render with the supplied `colorHex`
 * as a left-edge accent; unverified (auto-created by extraction) tags
 * carry a dotted border + muted colour so they read as "draft" until an
 * admin promotes them at /admin/tags. Returns nothing for an empty list
 * so callers can drop the component into layouts without wrapper guards.
 */
export function TagChips({ tags, className }: Props): React.ReactElement | null {
  if (tags.length === 0) return null;
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)}>
      {tags.map((tag) => {
        const color = tag.colorHex ?? '#9ca3af';
        return (
          <li key={tag.slug}>
            <span
              data-unverified={tag.unverified ? 'true' : undefined}
              style={{ borderLeftColor: color }}
              className={cn(
                'inline-flex items-center border border-rule border-l-[3px] px-2 py-0.5 font-mono text-[11px]',
                tag.unverified
                  ? 'border-dashed text-muted-foreground'
                  : 'bg-paper-2 text-foreground',
              )}
            >
              {tag.name}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
