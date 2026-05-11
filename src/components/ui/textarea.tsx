import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full border border-rule bg-transparent px-2.5 py-2 font-mono text-sm leading-relaxed transition-colors outline-none",
        "placeholder:text-muted-foreground placeholder:italic",
        "focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/30",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
