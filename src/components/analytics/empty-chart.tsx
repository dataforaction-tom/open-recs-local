export function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
      {label}
    </div>
  );
}
