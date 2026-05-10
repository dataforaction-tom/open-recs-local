// Inline script that runs in <head> before hydration. It reads the persisted
// theme out of localStorage (or falls back to the OS preference) and adds the
// `dark` class to <html> so the first paint matches what next-themes will pick
// once the React tree mounts. Without this script, dark-mode users see a brief
// flash of light theme on every navigation.
const SCRIPT = `(()=>{try{const t=localStorage.getItem('theme');const m=window.matchMedia('(prefers-color-scheme: dark)').matches;const dark=t==='dark'||(t!=='light'&&m);if(dark){document.documentElement.classList.add('dark');}}catch(_){}})();`;

export function ThemeInitializer() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
