'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { DarkModeToggle } from '@/components/theme/dark-mode-toggle';
import { FeatureGate } from '@/components/feature-gate';
import { UserMenu } from '@/components/nav/user-menu';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/sources', label: 'Sources' },
  { href: '/search', label: 'Search' },
  { href: '/chat', label: 'Chat' },
  { href: '/analytics', label: 'Analytics' },
] as const;

export function Navigation() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-background">
      <Container className="flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            open-recs-local
          </Link>
          <nav aria-label="Main">
            <ul className="flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                const active = pathname === link.href;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'inline-flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground',
                        active && 'bg-muted text-foreground',
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
                    aria-current={pathname === '/admin' ? 'page' : undefined}
                    className={cn(
                      'inline-flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground',
                      pathname === '/admin' && 'bg-muted text-foreground',
                    )}
                  >
                    Admin
                  </Link>
                </li>
              </FeatureGate>
            </ul>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <FeatureGate feature="auth">
            <UserMenu />
          </FeatureGate>
          <DarkModeToggle />
        </div>
      </Container>
    </header>
  );
}
