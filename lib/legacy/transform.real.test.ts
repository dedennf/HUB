// Uji opsional dengan file cadangan asli pemilik. Tidak berjalan di CI.
// LEGACY_BACKUP=/path/cadangan.json LEGACY_PAYLOAD_OUT=/path/payload.json npx vitest run lib/legacy/transform.real.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { legacyBackup } from './schema';
import { transformLegacyBackup } from './transform';

const file = process.env.LEGACY_BACKUP;

describe.skipIf(!file)('cadangan asli', () => {
  it('bisa ditransformasi tanpa pemblokir', () => {
    const backup = legacyBackup.parse(JSON.parse(readFileSync(file!, 'utf8')));
    const slugs = ['o_makan', 'o_transport', 'o_kos', 'o_kuliah', 'o_riset', 'o_org', 'o_pulsa', 'o_langganan', 'o_harian', 'o_sehat',
      'o_hibur', 'o_hadiah', 'o_admin', 'o_lain', 'i_saku', 'i_gaji', 'i_beasiswa', 'i_proyek', 'i_invest', 'i_hadiah', 'i_lain'];
    // kategori bawaan diambil dari DB uji lewat env, atau dibiarkan kosong
    const catMap = process.env.LEGACY_CATEGORY_MAP ? new Map<string, string>(Object.entries(JSON.parse(process.env.LEGACY_CATEGORY_MAP))) : new Map<string, string>();
    expect(slugs.length).toBe(21);
    const r = transformLegacyBackup(backup, { existingMap: new Map(), categoryBySlug: catMap });
    expect(r.blockers).toEqual([]);
    console.log(JSON.stringify({ counts: r.counts, warnings: r.warnings.map((w) => w.type), expected: r.expectedBalances.map((b) => b.balance) }));
    if (process.env.LEGACY_PAYLOAD_OUT) writeFileSync(process.env.LEGACY_PAYLOAD_OUT, JSON.stringify({ payload: r.payload, expected: r.expectedBalances }));
  });
});
