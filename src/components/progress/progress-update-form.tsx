'use client';

import { useId, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ProgressUpdateInput,
  type ProgressUpdateInputT,
} from '@/lib/validation/progress-update';

export type ProgressUpdateAction = (
  input: ProgressUpdateInputT,
) => Promise<{ ok: true } | { ok: false; error: string }>;

export type TaxonomyOption = { slug: string; name: string };

type Props = {
  recommendationId: string;
  evidenceTypes: TaxonomyOption[];
  progressRatings: TaxonomyOption[];
  action: ProgressUpdateAction;
  onSuccess?: () => void;
};

const NONE_VALUE = '__none__';

export function ProgressUpdateForm({
  recommendationId,
  evidenceTypes,
  progressRatings,
  action,
  onSuccess,
}: Props) {
  const notesId = useId();
  const evidenceTypeId = useId();
  const evidenceUrlId = useId();
  const ratingId = useId();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors },
  } = useForm<ProgressUpdateInputT>({
    resolver: zodResolver(ProgressUpdateInput),
    defaultValues: {
      recommendationId,
      progressNotes: '',
    },
  });

  function onSubmit(values: ProgressUpdateInputT) {
    startTransition(async () => {
      const cleaned: ProgressUpdateInputT = {
        recommendationId: values.recommendationId,
        progressNotes: values.progressNotes,
        ...(values.evidenceType ? { evidenceType: values.evidenceType } : {}),
        ...(values.evidenceUrl ? { evidenceUrl: values.evidenceUrl } : {}),
        ...(values.userProgressRating ? { userProgressRating: values.userProgressRating } : {}),
      };
      const result = await action(cleaned);
      if (result.ok) {
        reset({ recommendationId, progressNotes: '' });
        onSuccess?.();
      } else {
        setError('root', { message: "Couldn't post the update — please try again." });
      }
    });
  }

  return (
    <section className="border border-rule-strong bg-accent-ochre-soft/50 p-6">
      <div className="space-y-1">
        <h3 className="text-base font-medium">Post a progress update</h3>
        <p className="font-serif text-sm italic text-muted-foreground">
          Notes, evidence, and a status nudge. All fields except notes are optional.
        </p>
      </div>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <input type="hidden" {...register('recommendationId')} />

        <div className="space-y-1.5">
          <Label htmlFor={notesId}>
            Progress notes <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id={notesId}
            rows={4}
            placeholder="What changed? What's next?"
            className="bg-background"
            aria-invalid={errors.progressNotes ? true : undefined}
            {...register('progressNotes')}
          />
          {errors.progressNotes && (
            <p className="text-sm text-destructive">{errors.progressNotes.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={evidenceTypeId}>Evidence type</Label>
            <Controller
              control={control}
              name="evidenceType"
              render={({ field }) => (
                <Select
                  value={field.value ?? NONE_VALUE}
                  onValueChange={(v) =>
                    field.onChange(v === NONE_VALUE ? undefined : (v as string))
                  }
                >
                  <SelectTrigger id={evidenceTypeId} className="w-full bg-background">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {evidenceTypes.map((opt) => (
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
            <Label htmlFor={ratingId}>Rating</Label>
            <Controller
              control={control}
              name="userProgressRating"
              render={({ field }) => (
                <Select
                  value={field.value ?? NONE_VALUE}
                  onValueChange={(v) =>
                    field.onChange(v === NONE_VALUE ? undefined : (v as string))
                  }
                >
                  <SelectTrigger id={ratingId} className="w-full bg-background">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {progressRatings.map((opt) => (
                      <SelectItem key={opt.slug} value={opt.slug}>
                        {opt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={evidenceUrlId}>Evidence URL or reference</Label>
          <Input
            id={evidenceUrlId}
            type="text"
            placeholder="https://… or internal/path.docx"
            className="bg-background"
            {...register('evidenceUrl')}
          />
          {errors.evidenceUrl && (
            <p className="text-sm text-destructive">{errors.evidenceUrl.message}</p>
          )}
        </div>

        {errors.root && (
          <div
            role="alert"
            className="border border-destructive bg-accent-claret-soft px-3 py-2 text-sm text-destructive"
          >
            {errors.root.message}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="default" disabled={isPending}>
            {isPending ? 'Posting…' : 'Post update'}
          </Button>
        </div>
      </form>
    </section>
  );
}
