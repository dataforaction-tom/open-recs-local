'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Editorial upload bay. Two columns on desktop: the form on the left, a
 * short prose note on the right explaining what the pipeline does after
 * submit. No card chrome — a single rule above and below.
 */
export function SourceUploadForm() {
  const router = useRouter();
  const fileId = useId();
  const titleId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
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
      if (fileRef.current) fileRef.current.value = '';
      if (titleRef.current) titleRef.current.value = '';
      router.refresh();
    });
  }

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
            Refresh to watch the catalogue advance through each step.
          </p>
        </aside>
      </div>
    </section>
  );
}
