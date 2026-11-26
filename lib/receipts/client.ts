// Persiapan struk di browser (SPEC 7.2): hash SHA-256 berkas asli, kompres foto (sisi terpanjang 1600 px, JPEG 0,8), lalu unggah.
import { ApiFailure } from '@/lib/agent/client';
import type { ReceiptResult } from './service';

export const ACCEPT_GALLERY = 'image/*,application/pdf';
const MAX_UPLOAD = 4 * 1024 * 1024;
const MAX_SIDE = 1600;

export type PreparedReceipt = { blob: Blob; mime: string; hash: string; name: string; preview: string | null };

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Ukuran baru dengan sisi terpanjang paling besar `max`, rasio tetap. */
export function fitSize(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

const isHeic = (f: File) => /image\/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

async function compress(file: File): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file);
    const { w, h } = fitSize(bmp.width, bmp.height);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#fff'; // PNG transparan jadi latar putih, bukan hitam
    g.fillRect(0, 0, w, h);
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8));
  } catch {
    return null; // mis. HEIC di Chrome: browser tidak bisa membaca, kirim berkas asli
  }
}

export async function prepareReceipt(file: File): Promise<PreparedReceipt> {
  const hash = await sha256Hex(await file.arrayBuffer());
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!pdf && !file.type.startsWith('image/') && !isHeic(file)) throw new ApiFailure(`${file.name}: bukan foto atau PDF.`, 415);
  let blob: Blob = file;
  let mime = pdf ? 'application/pdf' : file.type || (isHeic(file) ? 'image/heic' : 'image/jpeg');
  if (!pdf) {
    const small = await compress(file);
    if (small) { blob = small; mime = 'image/jpeg'; }
    else if (isHeic(file)) mime = 'image/heic';
  }
  if (blob.size > MAX_UPLOAD) throw new ApiFailure(`${file.name}: berkas terlalu besar (maks 4 MB).`, 413);
  return { blob, mime, hash, name: file.name || 'struk', preview: pdf || mime === 'image/heic' ? null : URL.createObjectURL(blob) };
}

export async function uploadReceipt(r: PreparedReceipt, conversationId: string | null, note?: string): Promise<ReceiptResult> {
  const fd = new FormData();
  if (note?.trim()) fd.set('note', note.trim());
  fd.set('file', new File([r.blob], r.name.replace(/\.(heic|heif|png|webp)$/i, r.mime === 'image/jpeg' ? '.jpg' : '.$1'), { type: r.mime }));
  fd.set('hash', r.hash);
  if (conversationId) fd.set('conversation_id', conversationId);
  let res: Response;
  try {
    res = await fetch('/api/receipts/upload', { method: 'POST', body: fd });
  } catch {
    throw new ApiFailure('Tidak bisa menghubungi server Kompas. Cek koneksi internet.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !('status' in data && 'message' in data)) throw new ApiFailure(data.error ?? (res.status === 504 ? 'Server terlalu lama membaca struk (504).' : `Server menjawab galat ${res.status}.`), res.status);
  return data as ReceiptResult;
}
