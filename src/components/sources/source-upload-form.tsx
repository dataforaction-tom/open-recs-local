'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Phase = 'parsing' | 'extracting' | 'embedding' | 'ready' | 'failed';

type ProgressState = {
  phase: Phase | null;
  percent: number;
  message: string | null;
};

/**
 * Editorial upload bay. Two columns on desktop: the form on the left, a
 * short prose note on the right explaining what the pipeline does after
 * submit. No card chrome — a single rule above and below.
 *
 * After a successful upload, the returned `jobId` opens an SSE stream
 * (`/api/jobs/[id]/stream`) so the user sees live pipeline progress without
 * manually refreshing. The stream closes automatically when the source
 * reaches `ready` or `failed`.
 */
export function SourceUploadForm() {
  const router = useRouter();
  const fileId = useId();
  const titleId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [progress, setProgress] = useState<ProgressState | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setProgress(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Pick a PDF first.');
      return;
    }
    const formData = new FormData();
    formData.set('file', file);
    const title = titleRef.current?.value.trim();
    if (title) formData.set('title', title);

    startTransition(async () => {
      const res = await fetch('/api/sources', { method: 'POST', body: formData });
      if (!res.ok) {
        let detail = `Upload failed (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) detail = body.error;
        } catch {
          /* keep status-derived message */
        }
        setError(detail);
        return;
      }
      const body = (await res.json()) as { sourceId: string; jobId: string };
      // Wire SSE to show live pipeline progress.
      subscribeToJob(body.jobId);
      if (fileRef.current) fileRef.current.value = '';
      if (titleRef.current) titleRef.current.value = '';
      router.refresh();
    });
  }

  function subscribeToJob(jobId: string) {
    setProgress({ phase: null, percent: 0, message: null });
    const es = new EventSource(`/api/jobs/${jobId}/stream`);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as
          | { type: 'phase'; phase: Phase }
          | { type: 'progress'; percent: number; message?: string }
          | { type: 'error'; message: string };
        if (event.type === 'phase') {
          setProgress((p) => ({ phase: event.phase, percent: p?.percent ?? 0, message: p?.message ?? null }));
          if (event.phase === 'ready' || event.phase === 'failed') {
            es.close();
            // Final refresh so the catalogue reflects the completed state.
            router.refresh();
          }
        } else if (event.type === 'progress') {
          setProgress((p) => ({
            phase: p?.phase ?? null,
            percent: event.percent,
            message: event.message ?? null,
          }));
        } else if (event.type === 'error') {
          setProgress((p) => ({ phase: 'failed', percent: p?.percent ?? 0, message: event.message }));
          es.close();
        }
      } catch {
        // Malformed SSE payload — ignore, the stream stays open.
      }
    };

    es.onerror = () => {
      es.close();
    };
  }

  const phaseLabel: Record<Phase, string> = {
    parsing: 'Parsing',
    extracting: 'Extracting',
    embedding: 'Embedding',
    ready: 'Ready',
    failed: 'Failed',
  };

  return (
    <section
      aria-labelledby="upload-heading"
      className="border border-rule-strong bg-accent-soft/40 p-8"
    >
      <div className="grid gap-10 md:grid-cols-[1fr_18rem]">
        <form className="space-y-5" onSubmit={onSubmit} noValidate>
          <div>
            <h2 id="upload-heading" className="text-lg font-medium">
              Upload a new source
            </h2>
            <p className="mt-1 font-serif text-sm italic text-muted-foreground">
              PDF only · 50 MB maximum.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={titleId} className="text-sm text-muted-foreground">
              Title <span className="italic text-muted-foreground/70">(optional)</span>
            </Label>
            <Input
              id={titleId}
              ref={titleRef}
              type="text"
              placeholder="Annual safeguarding review 2025"
              className="bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fileId} className="text-sm text-muted-foreground">
              PDF
            </Label>
            <Input
              id={fileId}
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="bg-background"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="border border-destructive bg-accent-claret-soft px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {progress && progress.phase && (
            <div className="border border-rule px-3 py-2 text-sm">
              <span className="font-medium">{phaseLabel[progress.phase]}</span>
              {progress.percent > 0 && (
                <span className="ml-2 tabular-nums text-muted-foreground">{progress.percent}%</span>
              )}
              {progress.message && (
                <p className="mt-1 font-serif italic text-muted-foreground">{progress.message}</p>
              )}
            </div>
          )}

          <div>
            <Button type="submit" variant="default" disabled={isPending}>
              {isPending ? 'Uploading…' : 'Upload PDF'}
            </Button>
          </div>
        </form>

        <aside className="space-y-4 md:border-l md:border-rule md:pl-8">
          <h3 className="text-sm font-medium">What happens next</h3>
          <ol className="space-y-3 text-sm">
            <li className="flex items-baseline gap-3">
              <span className="font-medium text-accent">01</span>
              <span>
                <span className="font-medium">Parse.</span>{' '}
                <span className="font-serif italic text-muted-foreground">
                  The PDF is OCRed into a canonical markdown copy.
                </span>
              </span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="font-medium text-accent-ochre">02</span>
              <span>
                <span className="font-medium">Extract.</span>{' '}
                <span className="font-serif italic text-muted-foreground">
                  An LLM pulls out each recommendation as its own record.
                </span>
              </span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="font-medium text-accent-moss">03</span>
              <span>
                <span className="font-medium">Embed.</span>{' '}
                <span className="font-serif italic text-muted-foreground">
                  Vectors are indexed so each rec is searchable.
                </span>
              </span>
            </li>
          </ol>
          <p className="font-serif text-sm italic text-muted-foreground">
            Progress updates appear automatically after upload.
          </p>
        </aside>
      </div>
    </section>
  );
}