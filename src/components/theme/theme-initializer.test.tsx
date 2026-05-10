import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeInitializer } from './theme-initializer';

describe('ThemeInitializer', () => {
  it('emits an inline script that adds the dark class when stored theme is dark', () => {
    const html = renderToStaticMarkup(<ThemeInitializer />);
    expect(html).toContain('<script');
    expect(html).toContain("localStorage.getItem('theme')");
    expect(html).toContain("'dark'");
    expect(html).toContain('classList.add');
  });

  it('handles the system fallback via prefers-color-scheme', () => {
    const html = renderToStaticMarkup(<ThemeInitializer />);
    expect(html).toContain('prefers-color-scheme');
  });
});
