import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

/**
 * Research-instrument input. A rule above and below, mono content, no fill.
 * Focus tinges the rule and underline with the accent. Reads like a fill-in
 * field on a printed form.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 border border-rule bg-background px-2.5 py-1 font-mono text-sm leading-none transition-colors outline-none",
        "placeholder:text-muted-foreground placeholder:italic",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/40",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/30",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
