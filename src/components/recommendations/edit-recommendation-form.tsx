'use client';

import { useId, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TagMultiSelect, type TagOption } from '@/components/tags/tag-multi-select';
import {
  EditRecommendationInput,
  type EditRecommendationInputT,
} from '@/lib/validation/edit-recommendation';

export type EditRecommendationAction = (
  input: EditRecommendationInputT,
) => Promise<{ ok: true } | { ok: false; error: string }>;

type AxisKey = 'thematic_areas' | 'purposes' | 'target_audience_types' | 'location_scopes';
export type RecAxisOptions = Record<AxisKey, TagOption[]> & {
  priority_timescales: TagOption[];
};
export type RecAxisMemberships = Record<AxisKey, string[]>;

type Props = {
  rec: {
    id: string;
    title: string;
    body: string;
    targetOrganization: string | null;
    notes: string | null;
    pageStart: number | null;
    priorityTimescaleSlug: string | null;
    confidence: 'high' | 'medium' | 'low' | null;
  };
  axisOptions: RecAxisOptions;
  initialMemberships: RecAxisMemberships;
  action: EditRecommendationAction;
  onSuccess?: () => void;
};

const NONE = '__none__';

export function EditRecommendationForm({
  rec,
  axisOptions,
  initialMemberships,
  action,
  onSuccess,
}: Props) {
  const titleId = useId();
  const bodyId = useId();
  const orgId = useId();
  const notesId = useId();
  const pageStartId = useId();
  const priorityId = useId();
  const confidenceId = useId();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<EditRecommendationInputT>({
    resolver: zodResolver(EditRecommendationInput),
    defaultValues: {
      recommendationId: rec.id,
      title: rec.title,
      body: rec.body,
      target_organization: rec.targetOrganization,
      priority_timescale_slug: rec.priorityTimescaleSlug,
      confidence: rec.confidence,
      notes: rec.notes,
      page_start: rec.pageStart,
      thematic_area_slugs: initialMemberships.thematic_areas,
      purpose_slugs: initialMemberships.purposes,
      target_audience_type_slugs: initialMemberships.target_audience_types,
      location_scope_slugs: initialMemberships.location_scopes,
    },
  });

  function onSubmit(values: EditRecommendationInputT) {
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
      <input type="hidden" {...register('recommendationId')} />

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
          <Label htmlFor={bodyId}>
            Body <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id={bodyId}
            rows={8}
            className="bg-background"
            aria-invalid={errors.body ? true : undefined}
            {...register('body')}
          />
          {errors.body && <p className="text-sm text-destructive">{errors.body.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={orgId}>Target organisation</Label>
          <Input id={orgId} className="bg-background" {...register('target_organization')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={priorityId}>Priority timescale</Label>
          <Controller
            control={control}
            name="priority_timescale_slug"
            render={({ field }) => (
              <Select
                value={field.value ?? NONE}
                onValueChange={(v) => field.onChange(v === NONE ? null : (v as string))}
              >
                <SelectTrigger id={priorityId} className="w-full bg-background">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {axisOptions.priority_timescales.map((opt) => (
                    <SelectItem key={opt.slug} value={opt.slug}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={confidenceId}>Confidence</Label>
          <Controller
            control={control}
            name="confidence"
            render={({ field }) => (
              <Select
                value={field.value ?? NONE}
                onValueChange={(v) =>
                  field.onChange(v === NONE ? null : (v as 'high' | 'medium' | 'low'))
                }
              >
                <SelectTrigger id={confidenceId} className="w-full bg-background">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={pageStartId}>Page start</Label>
          <Input
            id={pageStartId}
            type="number"
            className="bg-background"
            {...register('page_start', {
              setValueAs: (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
            })}
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={notesId}>Notes</Label>
          <Textarea id={notesId} rows={3} className="bg-background" {...register('notes')} />
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
        <Controller
          control={control}
          name="location_scope_slugs"
          render={({ field }) => (
            <TagMultiSelect
              label="Location scopes"
              options={axisOptions.location_scopes}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>

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
