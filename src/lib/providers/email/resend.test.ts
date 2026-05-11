import { afterEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

import { createResendEmail } from './resend';

afterEach(() => {
  sendMock.mockReset();
});

describe('createResendEmail', () => {
  it('forwards the message to Resend with from/to/subject + text', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'msg_123' }, error: null });
    const provider = createResendEmail({ apiKey: 're_key', from: 'noreply@app.test' });
    await provider.send({ to: 'user@example.com', subject: 'Welcome', text: 'Hello' });
    expect(sendMock).toHaveBeenCalledWith({
      from: 'noreply@app.test',
      to: 'user@example.com',
      subject: 'Welcome',
      text: 'Hello',
    });
  });

  it('passes html through when supplied', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'msg_456' }, error: null });
    const provider = createResendEmail({ apiKey: 're_key', from: 'noreply@app.test' });
    await provider.send({
      to: 'u@e.com',
      subject: 's',
      html: '<p>hi</p>',
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ html: '<p>hi</p>' }),
    );
  });

  it('throws when Resend returns an error', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: 'invalid api key' } });
    const provider = createResendEmail({ apiKey: 're_key', from: 'noreply@app.test' });
    await expect(
      provider.send({ to: 'u@e.com', subject: 's', text: 'x' }),
    ).rejects.toThrow(/invalid api key/);
  });

  it('exposes the provider name', () => {
    const provider = createResendEmail({ apiKey: 're_key', from: 'noreply@app.test' });
    expect(provider.name).toBe('resend');
  });
});
