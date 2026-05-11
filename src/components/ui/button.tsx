import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Editorial-minimalist buttons with controlled splashes of colour.
 *
 * `default`     — filled teal accent. Primary action on a page.
 * `outline`     — hairline rule + foreground text. Workhorse for inline
 *                 actions; hover fills accent.
 * `secondary`   — soft accent-tinted background. Tertiary actions where
 *                 colour is welcome but the button shouldn't shout.
 * `ghost`       — text-only, calm muted-foreground until hovered.
 * `destructive` — outlined claret; fills claret on hover. Reserved for
 *                 truly destructive actions (delete, reject, withdraw).
 * `subtle`      — paper-2 background, foreground text, no border. Used
 *                 for row-level actions inside cards or tables where a
 *                 visible rule would be noisy.
 * `link`        — accent underline only.
 */
const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center gap-1.5 border whitespace-nowrap select-none outline-none transition-colors",
    "font-sans text-[0.88rem] font-medium",
    "focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-40",
    "aria-invalid:border-destructive",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "border-accent bg-accent text-accent-foreground hover:bg-[color-mix(in_oklch,var(--accent)_88%,black)]",
        outline:
          "border-rule-strong bg-transparent text-foreground hover:border-accent hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        secondary:
          "border-transparent bg-accent-soft text-accent hover:bg-accent hover:text-accent-foreground",
        subtle:
          "border-transparent bg-paper-2 text-foreground hover:bg-foreground hover:text-background",
        ghost:
          "border-transparent text-muted-foreground hover:text-foreground hover:bg-paper-2",
        destructive:
          "border-destructive bg-transparent text-destructive hover:bg-destructive hover:text-destructive-foreground",
        link:
          "border-transparent bg-transparent text-accent underline underline-offset-4 hover:text-foreground",
      },
      size: {
        default: "h-9 px-4",
        xs: "h-7 px-2.5 text-[0.78rem]",
        sm: "h-8 px-3 text-[0.82rem]",
        lg: "h-10 px-5",
        icon: "size-9",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "outline",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
