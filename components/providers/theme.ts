// Tema: 'auto' | 'light' | 'dark'. Disimpan di localStorage (agar tidak berkedip) dan tabel settings (lintas perangkat).
export type ThemeChoice = 'auto' | 'light' | 'dark';
export const THEME_KEY = 'kompas-theme';

export function applyTheme(choice: ThemeChoice) {
  try { localStorage.setItem(THEME_KEY, choice); } catch { /* mode privat browser */ }
  const root = document.documentElement;
  if (choice === 'auto') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

/** Skrip kecil di <head>: pasang tema sebelum halaman tampil. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}})();`;
