'use client';

import { useId, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card>
      <CardHeader>
        <CardTitle>Post a progress update</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <input type="hidden" {...register('recommendationId')} />

          <div className="space-y-1.5">
            <Label htmlFor={notesId}>
              Progress notes <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id={notesId}
              rows={4}
              placeholder="What changed? What's next?"
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
                    <SelectTrigger id={evidenceTypeId} className="w-full">
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
                    <SelectTrigger id={ratingId} className="w-full">
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
            <input
              id={evidenceUrlId}
              type="text"
              placeholder="https://… or internal/path.docx"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              {...register('evidenceUrl')}
            />
            {errors.evidenceUrl && (
              <p className="text-sm text-destructive">{errors.evidenceUrl.message}</p>
            )}
          </div>

          {errors.root && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errors.root.message}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Posting…' : 'Post update'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
