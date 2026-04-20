import { describe, expect, it } from 'vitest';
import { localAuth } from './local';

describe('LocalAuthContext', () => {
  it('always returns system user with admin role', async () => {
    const ctx = await localAuth.getContext(new Request('http://localhost/'));
    expect(ctx.isSystem).toBe(true);
    expect(ctx.user.id).toBe('system');
    expect(ctx.roles).toContain('admin');
  });

  it('ignores any request metadata (cookies, headers) — no auth in local mode', async () => {
    const req = new Request('http://localhost/', {
      headers: { authorization: 'Bearer nope', cookie: 'session=whatever' },
    });
    const ctx = await localAuth.getContext(req);
    expect(ctx.isSystem).toBe(true);
  });
});
