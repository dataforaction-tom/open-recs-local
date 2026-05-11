import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * The page-shell column. Sized for comfortable reading on desktop; capped
 * with generous gutters so dense data sits comfortably without crowding
 * the viewport edges.
 */
export function Container({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mx-auto w-full max-w-[78rem] px-6 sm:px-8 lg:px-12', className)}
      {...props}
    >
      {children}
    </div>
  );
}
