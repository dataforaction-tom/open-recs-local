'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TaxonomyAxis, TaxonomyRow } from '@/lib/repositories/taxonomy';

export type TagAction<T> = (input: T) => Promise<{ ok: true } | { ok: false; error: string }>;

export type AxisSection = {
  axis: TaxonomyAxis;
  unverified: ReadonlyArray<TaxonomyRow>;
  verified: ReadonlyArray<TaxonomyRow>;
};

type Props = {
  sections: ReadonlyArray<AxisSection>;
  onPromote: TagAction<{ axis: TaxonomyAxis; id: string }>;
  onRename: TagAction<{ axis: TaxonomyAxis; id: string; name: string }>;
  onMerge: TagAction<{ axis: TaxonomyAxis; fromId: string; toId: string }>;
  onDelete: TagAction<{ axis: TaxonomyAxis; id: string }>;
};

function humaniseAxis(axis: TaxonomyAxis): string {
  return axis.replace(/_/g, ' ');
}

export function TagReviewQueue({
  sections,
  onPromote,
  onRename,
  onMerge,
  onDelete,
}: Props) {
  return (
    <div className="space-y-10">
      {sections.map((section) => (
        <AxisCard
          key={section.axis}
          section={section}
          onPromote={onPromote}
          onRename={onRename}
          onMerge={onMerge}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

type CardProps = Omit<Props, 'sections'> & { section: AxisSection };

function AxisCard({ section, onPromote, onRename, onMerge, onDelete }: CardProps) {
  return (
    <section className="space-y-3">
      <div className="border-b border-rule-strong pb-2">
        <h2 className="text-sm font-medium capitalize">{humaniseAxis(section.axis)}</h2>
        <p className="font-serif text-xs italic text-muted-foreground">
          {section.unverified.length} unverified · {section.verified.length} verified
        </p>
      </div>
      {section.unverified.length === 0 ? (
        <p className="font-serif text-sm italic text-muted-foreground">
          No unverified tags — the queue is quiet for this axis.
        </p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {section.unverified.map((tag) => (
            <TagRow
              key={tag.id}
              axis={section.axis}
              tag={tag}
              verified={section.verified}
              onPromote={onPromote}
              onRename={onRename}
              onMerge={onMerge}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

type RowProps = {
  axis: TaxonomyAxis;
  tag: TaxonomyRow;
  verified: ReadonlyArray<TaxonomyRow>;
  onPromote: Props['onPromote'];
  onRename: Props['onRename'];
  onMerge: Props['onMerge'];
  onDelete: Props['onDelete'];
};

function TagRow({ axis, tag, verified, onPromote, onRename, onMerge, onDelete }: RowProps) {
  const [renameMode, setRenameMode] = useState(false);
  const [newName, setNewName] = useState(tag.name);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function call<I>(action: TagAction<I>, input: I): void {
    setError(null);
    startTransition(async () => {
      const result = await action(input);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      <div className="space-y-0.5">
        {renameMode ? (
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="bg-background"
            />
            <Button
              size="sm"
              variant="default"
              disabled={isPending || newName === tag.name}
              onClick={() => {
                call(onRename, { axis, id: tag.id, name: newName });
                setRenameMode(false);
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRenameMode(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <div className="font-medium">{tag.name}</div>
            <div className="font-mono text-xs text-muted-foreground">{tag.slug}</div>
          </>
        )}
        {error && <div className="text-xs text-destructive">{error}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="default"
          disabled={isPending}
          onClick={() => call(onPromote, { axis, id: tag.id })}
        >
          Promote
        </Button>
        {!renameMode && (
          <Button size="sm" variant="outline" onClick={() => setRenameMode(true)}>
            Rename
          </Button>
        )}
        <Select
          value={mergeTargetId ?? ''}
          onValueChange={(v) => setMergeTargetId(v || null)}
        >
          <SelectTrigger className="w-44 bg-background">
            <SelectValue placeholder="Merge into…" />
          </SelectTrigger>
          <SelectContent>
            {verified.map((target) => (
              <SelectItem key={target.id} value={target.id}>
                {target.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending || !mergeTargetId}
          onClick={() => {
            if (mergeTargetId) call(onMerge, { axis, fromId: tag.id, toId: mergeTargetId });
          }}
        >
          Merge
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => call(onDelete, { axis, id: tag.id })}
          className="text-destructive"
        >
          Delete
        </Button>
      </div>
    </li>
  );
}
