import type { EmailMessage, EmailProvider } from './types';

const URL_RE = /https?:\/\/\S+/g;

/**
 * Writes outgoing email to stdout in a copy-pastable format so operators can
 * click the reset / magic-link URLs out of the dev or container logs. Default
 * email provider for hosted-mode boot until a real backend (Resend, SMTP)
 * lands in Phase 10.
 *
 * URLs in the body are extracted and listed separately because the most
 * common operator action is "I need that link" — surface them up front.
 */
export function createConsoleEmail(
  opts: { writer?: (line: string) => void } = {},
): EmailProvider {
  const write = opts.writer ?? ((line: string) => console.log(line));
  return {
    name: 'console',
    async send(message: EmailMessage): Promise<void> {
      const body = message.text ?? message.html ?? '';
      const urls = body.match(URL_RE) ?? [];
      const lines = [
        '────────────── email (console) ──────────────',
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
      ];
      for (const url of urls) lines.push(`URL:     ${url}`);
      lines.push('─────────────────────────────────────────────');
      for (const line of lines) write(line);
    },
  };
}
