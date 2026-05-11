import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Editorial-minimalist Badge. A calm sans label, no uppercase, no brackets,
 * single hairline rule. Reserved for free-form labels (filter chips,
 * taxonomies). Use `<StatusBadge>` for pipeline / recommendation state —
 * it uses the dot-indicator `.status` class for an even quieter read.
 */
const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 px-2 py-0.5 leading-tight",
    "font-sans text-[0.78rem] font-medium",
    "border whitespace-nowrap transition-colors",
    "focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "aria-invalid:border-destructive",
    "[&>svg]:pointer-events-none [&>svg]:size-3",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "border-rule-strong text-foreground",
        secondary: "border-rule text-muted-foreground",
        outline: "border-rule text-foreground bg-transparent",
        active: "border-accent text-accent",
        done: "border-accent text-accent bg-[color-mix(in_oklch,var(--accent)_6%,transparent)]",
        destructive: "border-destructive text-destructive",
        ghost: "border-transparent text-muted-foreground hover:text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
