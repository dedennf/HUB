// Flag boolean di localStorage yang bisa dibaca dengan useSyncExternalStore (tanpa setState di dalam effect).
type Listener = () => void;

export function createLocalFlag(key: string) {
  const listeners = new Set<Listener>();
  const read = () => {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  };
  return {
    subscribe(l: Listener) {
      listeners.add(l);
      const onStorage = (e: StorageEvent) => { if (e.key === key) l(); };
      window.addEventListener('storage', onStorage);
      return () => { listeners.delete(l); window.removeEventListener('storage', onStorage); };
    },
    get: read,
    getServer: () => false,
    set(v: boolean) {
      try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* mode privat browser */ }
      listeners.forEach((l) => l());
    },
  };
}
