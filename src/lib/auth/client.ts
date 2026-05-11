'use client';

import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

/**
 * Browser-side Better-auth client. The base URL is left undefined so the
 * client talks to whatever origin the page is served from — same-origin in
 * production and dev, no environment plumbing needed.
 */
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
