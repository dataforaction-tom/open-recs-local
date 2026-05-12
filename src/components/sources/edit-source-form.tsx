'use client';

import { useId, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TagMultiSelect, type TagOption } from '@/components/tags/tag-multi-select';
import {
  EditSourceInput,
  type EditSourceInputT,
} from '@/lib/validation/edit-source';

export type EditSourceAction = (
  input: EditSourceInputT,
) => Promise<{ ok: true } | { ok: false; error: string }>;

type AxisKey =
  | 'thematic_areas'
  | 'source_types'
  | 'purposes'
  | 'role_relevances'
  | 'target_audience_types';

export type AxisOptions = Record<AxisKey, TagOption[]>;
export type AxisMemberships = Record<AxisKey, string[]>;

type Props = {
  source: {
    id: string;
    title: string;
    summary: string | null;
    authors: string[];
    publicationDate: Date | null;
    orgOwner: string | null;
    originalUrl: string | null;
    attachmentUrl: string | null;
    datasets: Array<{ description: string; url: string }>;
    isPrivate: boolean;
  };
  axisOptions: AxisOptions;
  initialMemberships: AxisMemberships;
  showPrivacyToggle: boolean;
  action: EditSourceAction;
  onSuccess?: () => void;
};

function dateToInputValue(d: Date | null): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

export function EditSourceForm({
  source,
  axisOptions,
  initialMemberships,
  showPrivacyToggle,
  action,
  onSuccess,
}: Props) {
  const titleId = useId();
  const summaryId = useId();
  const authorsId = useId();
  const publicationDateId = useId();
  const orgOwnerId = useId();
  const originalUrlId = useId();
  const attachmentUrlId = useId();
  const privateId = useId();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<EditSourceInputT>({
    resolver: zodResolver(EditSourceInput),
    defaultValues: {
      sourceId: source.id,
      title: source.title,
      summary: source.summary,
      authors: source.authors,
      publication_date: source.publicationDate
        ? dateToInputValue(source.publicationDate)
        : null,
      org_owner: source.orgOwner,
      original_url: source.originalUrl,
      attachment_url: source.attachmentUrl,
      datasets: source.datasets,
      is_private: showPrivacyToggle ? source.isPrivate : undefined,
      thematic_area_slugs: initialMemberships.thematic_areas,
      source_type_slugs: initialMemberships.source_types,
      purpose_slugs: initialMemberships.purposes,
      role_relevance_slugs: initialMemberships.role_relevances,
      target_audience_type_slugs: initialMemberships.target_audience_types,
    },
  });

  function onSubmit(values: EditSourceInputT) {
    startTransition(async () => {
      const result = await action(values);
      if (result.ok) {
        onSuccess?.();
      } else {
        setError('root', { message: `Save failed: ${result.error}` });
      }
    });
  }

  return (
    <form className="space-y-8" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register('sourceId')} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={titleId}>
            Title <span className="text-destructive">*</span>
          </Label>
          <Input
            id={titleId}
            className="bg-background"
            aria-invalid={errors.title ? true : undefined}
            {...register('title')}
          />
          {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={summaryId}>Summary</Label>
          <Textarea id={summaryId} rows={3} className="bg-background" {...register('summary')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={authorsId}>Authors (one per line)</Label>
          <Controller
            control={control}
            name="authors"
            render={({ field }) => (
              <Textarea
                id={authorsId}
                rows={3}
                className="bg-background"
                value={field.value.join('\n')}
                onChange={(e) =>
                  field.onChange(
                    e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter((s) => s.length > 0),
                  )
                }
              />
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={publicationDateId}>Publication date</Label>
          <Input
            id={publicationDateId}
            type="date"
            className="bg-background"
            {...register('publication_date')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={orgOwnerId}>Publishing organisation</Label>
          <Input id={orgOwnerId} className="bg-background" {...register('org_owner')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={originalUrlId}>Original URL</Label>
          <Input id={originalUrlId} className="bg-background" {...register('original_url')} />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={attachmentUrlId}>Attachment URL or path</Label>
          <Input id={attachmentUrlId} className="bg-background" {...register('attachment_url')} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Controller
          control={control}
          name="thematic_area_slugs"
          render={({ field }) => (
            <TagMultiSelect
              label="Thematic areas"
              options={axisOptions.thematic_areas}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="source_type_slugs"
          render={({ field }) => (
            <TagMultiSelect
              label="Source types"
              options={axisOptions.source_types}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="purpose_slugs"
          render={({ field }) => (
            <TagMultiSelect
              label="Purposes"
              options={axisOptions.purposes}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="role_relevance_slugs"
          render={({ field }) => (
            <TagMultiSelect
              label="Role relevances"
              options={axisOptions.role_relevances}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="target_audience_type_slugs"
          render={({ field }) => (
            <TagMultiSelect
              label="Target audiences"
              options={axisOptions.target_audience_types}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>

      {showPrivacyToggle && (
        <div className="flex items-center gap-2">
          <input id={privateId} type="checkbox" {...register('is_private')} />
          <Label htmlFor={privateId}>Private (visible only to admins and the owner)</Label>
        </div>
      )}

      {errors.root && (
        <div
          role="alert"
          className="border border-destructive bg-accent-claret-soft px-3 py-2 text-sm text-destructive"
        >
          {errors.root.message}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" variant="default" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
