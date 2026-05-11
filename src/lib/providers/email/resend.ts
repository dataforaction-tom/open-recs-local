import { Resend } from 'resend';
import type { EmailMessage, EmailProvider } from './types';

export type ResendEmailConfig = {
  apiKey: string;
  from: string;
};

/**
 * Resend-backed EmailProvider. Constructed lazily so importing the module in
 * a local-mode boot (where `RESEND_API_KEY` is absent) doesn't fail —
 * `createResendEmail` is only called by the factory when EMAIL_PROVIDER=resend.
 *
 * Resend requires at least one of `text` or `html`; the EmailMessage shape
 * documents the same invariant. Throws on the SDK's transport / API errors
 * so the calling action can surface them — Better-auth's flows already log
 * failures from `sendResetPassword` / `sendMagicLink` callbacks.
 */
export function createResendEmail(config: ResendEmailConfig): EmailProvider {
  const client = new Resend(config.apiKey);
  return {
    name: 'resend',
    async send(message: EmailMessage): Promise<void> {
      // Resend's CreateEmailOptions is a discriminated union over
      // text / html / react / template; build a concrete branch instead of
      // trying to type the polymorphic shape under exactOptionalPropertyTypes.
      const result = message.html
        ? await client.emails.send({
            from: config.from,
            to: message.to,
            subject: message.subject,
            html: message.html,
          })
        : await client.emails.send({
            from: config.from,
            to: message.to,
            subject: message.subject,
            text: message.text ?? '',
          });
      if (result.error) {
        throw new Error(`resend.send failed: ${result.error.message}`);
      }
    },
  };
}
