import { z } from 'zod';

export const SignUpInput = z.object({
  email: z.string().trim().email('Enter a valid email').max(254),
  password: z.string().min(8, 'At least 8 characters').max(256),
  name: z.string().trim().min(1, 'Required').max(120),
});
export type SignUpInputT = z.infer<typeof SignUpInput>;

export const LoginInput = z.object({
  email: z.string().trim().email('Enter a valid email').max(254),
  password: z.string().min(1, 'Required').max(256),
});
export type LoginInputT = z.infer<typeof LoginInput>;

export const MagicLinkInput = z.object({
  email: z.string().trim().email('Enter a valid email').max(254),
});
export type MagicLinkInputT = z.infer<typeof MagicLinkInput>;

export const ForgotPasswordInput = z.object({
  email: z.string().trim().email('Enter a valid email').max(254),
});
export type ForgotPasswordInputT = z.infer<typeof ForgotPasswordInput>;

export const ResetPasswordInput = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'At least 8 characters').max(256),
});
export type ResetPasswordInputT = z.infer<typeof ResetPasswordInput>;
