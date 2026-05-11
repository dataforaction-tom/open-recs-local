'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { DarkModeToggle } from '@/components/theme/dark-mode-toggle';
import { FeatureGate } from '@/components/feature-gate';
import { UserMenu } from '@/components/nav/user-menu';
import { cn } from '@/lib/utils';

/**
 * Editorial-minimalist navigation.
 *
 * Top row: a calm sans wordmark on the left, user/theme controls on the
 * right. Section nav below uses small sans labels with a subtle accent
 * underline on the active route. No filled backgrounds, no chrome —
 * just the words.
 */

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/sources', label: 'Sources' },
  { href: '/recommendations', label: 'Recommendations' },
  { href: '/search', label: 'Search' },
  { href: '/chat', label: 'Chat' },
  { href: '/analytics', label: 'Analytics' },
] as const;

export function Navigation() {
  const pathname = usePathname();

  return (
    <header className="border-b border-rule-strong bg-background">
      <Container className="flex flex-col">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link
            href="/"
            className="font-sans text-base font-medium tracking-tight hover:text-accent"
          >
            open recommendations
            <span className="ml-2 font-serif text-sm italic text-muted-foreground">
              · local edition
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <FeatureGate feature="auth">
              <UserMenu />
            </FeatureGate>
            <DarkModeToggle />
          </div>
        </div>

        <nav aria-label="Main" className="-mb-px">
          <ul className="flex flex-wrap items-center gap-0">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex h-11 items-center border-b-2 border-transparent px-4 text-sm transition-colors',
                      active
                        ? 'border-accent text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
            <FeatureGate feature="admin">
              <li>
                <Link
                  href="/admin"
                  aria-current={pathname.startsWith('/admin') ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-11 items-center border-b-2 border-transparent px-4 text-sm transition-colors',
                    pathname.startsWith('/admin')
                      ? 'border-accent text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Admin
                </Link>
              </li>
            </FeatureGate>
          </ul>
        </nav>
      </Container>
    </header>
  );
}
