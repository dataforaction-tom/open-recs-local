import Script from 'next/script';

/**
 * Anti-FOUC: read the persisted theme out of localStorage (or fall back to
 * the OS preference) and add the `dark` class to <html> before hydration so
 * the first paint matches what next-themes will pick.
 *
 * Renders via `next/script` with `strategy="beforeInteractive"`. React 19
 * emits "Encountered a script tag while rendering React component" for
 * raw `<script>` JSX; `next/script` handles the inlining outside React's
 * reconciliation so the warning goes away while the anti-FOUC behaviour
 * is preserved.
 *
 * `INIT_SCRIPT` is exported so the unit test can assert the JS logic
 * directly without depending on Next's renderer.
 */
export const INIT_SCRIPT = `(()=>{try{const t=localStorage.getItem('theme');const m=window.matchMedia('(prefers-color-scheme: dark)').matches;const dark=t==='dark'||(t!=='light'&&m);if(dark){document.documentElement.classList.add('dark');}}catch(_){}})();`;

export function ThemeInitializer() {
  return (
    <Script id="theme-initializer" strategy="beforeInteractive">
      {INIT_SCRIPT}
    </Script>
  );
}
