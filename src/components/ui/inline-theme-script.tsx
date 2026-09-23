// Injected in <head> to apply the saved theme before first paint —
// prevents a white flash for dark-mode users.
export function InlineThemeScript() {
  const code = `(function(){try{var t=localStorage.getItem('revisio-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
