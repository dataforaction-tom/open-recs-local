export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain-text body. At least one of `text` / `html` is required. */
  text?: string;
  /** HTML body. At least one of `text` / `html` is required. */
  html?: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}
