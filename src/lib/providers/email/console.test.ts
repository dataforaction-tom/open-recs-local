import { describe, expect, it } from 'vitest';
import { createConsoleEmail } from './console';

function captured() {
  const lines: string[] = [];
  const provider = createConsoleEmail({ writer: (line) => lines.push(line) });
  return { lines, provider };
}

describe('createConsoleEmail', () => {
  it('logs To, Subject, and the body', async () => {
    const { lines, provider } = captured();
    await provider.send({
      to: 'alice@example.com',
      subject: 'Reset your password',
      text: 'Click to reset.',
    });
    expect(lines.join('\n')).toContain('To:      alice@example.com');
    expect(lines.join('\n')).toContain('Subject: Reset your password');
  });

  it('surfaces URLs from the body as separate lines', async () => {
    const { lines, provider } = captured();
    await provider.send({
      to: 'bob@example.com',
      subject: 'Magic link',
      text: 'Sign in: https://app.example.com/api/auth/magic-link?token=abc',
    });
    expect(lines.some((l) => l.startsWith('URL:'))).toBe(true);
    expect(lines.find((l) => l.startsWith('URL:'))).toContain(
      'https://app.example.com/api/auth/magic-link?token=abc',
    );
  });

  it('falls back to html body when text is absent', async () => {
    const { lines, provider } = captured();
    await provider.send({
      to: 'c@example.com',
      subject: 's',
      html: '<a href="https://x/y">click</a>',
    });
    expect(lines.find((l) => l.startsWith('URL:'))).toContain('https://x/y');
  });

  it('handles a body with no URLs', async () => {
    const { lines, provider } = captured();
    await provider.send({ to: 'd@example.com', subject: 'hello', text: 'plain text' });
    expect(lines.some((l) => l.startsWith('URL:'))).toBe(false);
    expect(lines.join('\n')).toContain('To:      d@example.com');
  });

  it('exposes the provider name', () => {
    const { provider } = captured();
    expect(provider.name).toBe('console');
  });
});
