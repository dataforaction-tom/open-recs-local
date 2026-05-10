'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

const NEXT: Record<string, 'light' | 'dark' | 'system'> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

const ICONS: Record<string, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function DarkModeToggle() {
  const { theme = 'system', setTheme } = useTheme();
  const next = NEXT[theme] ?? 'light';
  const Icon = ICONS[theme] ?? Monitor;
  const label = `Theme: ${theme}. Switch to ${next}.`;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={() => setTheme(next)}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
