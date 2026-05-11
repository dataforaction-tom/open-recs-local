import { describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from './theme-initializer';

describe('ThemeInitializer / INIT_SCRIPT', () => {
  it('reads the persisted theme from localStorage', () => {
    expect(INIT_SCRIPT).toContain("localStorage.getItem('theme')");
  });

  it('falls back to prefers-color-scheme: dark for the OS default', () => {
    expect(INIT_SCRIPT).toContain('prefers-color-scheme: dark');
  });

  it("adds the 'dark' class when the resolved theme is dark", () => {
    expect(INIT_SCRIPT).toContain('classList.add');
    expect(INIT_SCRIPT).toContain("'dark'");
  });

  it('wraps the body in a try/catch so a storage failure does not break boot', () => {
    expect(INIT_SCRIPT).toContain('try');
    expect(INIT_SCRIPT).toContain('catch');
  });
});
