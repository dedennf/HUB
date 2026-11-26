import { describe, expect, it } from 'vitest';
import { backupsToPrune } from './backup';

describe('backupsToPrune', () => {
  it('menyisakan cadangan terbaru dan mengabaikan berkas lain', () => {
    const names = ['kompas-2026-10-04.json', 'catatan.txt', 'kompas-2026-11-22.json', 'kompas-2026-10-11.json', 'kompas-2026-11-15.json'];
    expect(backupsToPrune(names, 2)).toEqual(['kompas-2026-10-04.json', 'kompas-2026-10-11.json']);
    expect(backupsToPrune(names, 8)).toEqual([]);
  });
});
