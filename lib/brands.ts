// Logo bank, e-wallet, dan investasi (D-61). Logo diambil dari ikon situs resmi lewat layanan favicon,
// jadi tidak ada berkas merek yang disimpan di repo. Fungsi murni.

/** Kata kunci nama akun → domain situs resmi. Urutan penting: yang lebih spesifik di atas. */
const BRANDS: [RegExp, string][] = [
  [/\bblu\b|bca digital/i, 'blubybcadigital.id'],
  [/\bbca\b/i, 'bca.co.id'],
  [/\bbri\b|britama|brimo/i, 'bri.co.id'],
  [/\bbni\b/i, 'bni.co.id'],
  [/mandiri|livin/i, 'bankmandiri.co.id'],
  [/\bbsi\b|syariah indonesia/i, 'bankbsi.co.id'],
  [/\bbtn\b/i, 'btn.co.id'],
  [/cimb|octo/i, 'cimbniaga.co.id'],
  [/permata/i, 'permatabank.com'],
  [/danamon/i, 'danamon.co.id'],
  [/\bjago\b/i, 'jago.com'],
  [/seabank|sea bank/i, 'seabank.co.id'],
  [/jenius|\bbtpn\b/i, 'jenius.com'],
  [/ocbc|nyala/i, 'ocbc.id'],
  [/\ballo\b/i, 'allobank.com'],
  [/\bbjb\b/i, 'bankbjb.co.id'],
  [/\bmega\b/i, 'bankmega.com'],
  [/panin/i, 'panin.co.id'],
  [/maybank/i, 'maybank.co.id'],
  [/superbank/i, 'superbank.id'],
  [/gopay|gojek/i, 'gopay.co.id'],
  [/\bovo\b/i, 'ovo.id'],
  [/\bdana\b/i, 'dana.id'],
  [/shopee\s*pay|spay|shopee/i, 'shopee.co.id'],
  [/link\s*aja/i, 'linkaja.id'],
  [/\bflip\b/i, 'flip.id'],
  [/i\.?saku/i, 'isaku.co.id'],
  [/paypal/i, 'paypal.com'],
  [/bibit/i, 'bibit.id'],
  [/ajaib/i, 'ajaib.co.id'],
  [/bareksa/i, 'bareksa.com'],
  [/pluang/i, 'pluang.com'],
  [/stockbit/i, 'stockbit.com'],
  [/pintu/i, 'pintu.co.id'],
  [/indodax/i, 'indodax.com'],
  [/tokocrypto/i, 'tokocrypto.com'],
];

export function brandDomain(name: string, override?: string | null): string | null {
  if (override) return override;
  for (const [re, domain] of BRANDS) if (re.test(name)) return domain;
  return null;
}

export function logoUrl(domain: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/** Teks yang disalin: "BCA 1234567890 a.n. Nama". Nomor dirapikan dari spasi dan tanda hubung. */
export function shareText(a: { name: string; account_number: string | null; account_holder: string | null }): string {
  const num = (a.account_number ?? '').replace(/[\s-]/g, '');
  return [a.name, num, a.account_holder ? `a.n. ${a.account_holder}` : ''].filter(Boolean).join(' ');
}

/** Nomor dikelompokkan 4 digit supaya mudah dibacakan. */
export function groupNumber(n: string): string {
  const d = n.replace(/[\s-]/g, '');
  return /^\+?\d+$/.test(d) ? d.replace(/(\d{4})(?=\d)/g, '$1 ') : n;
}
