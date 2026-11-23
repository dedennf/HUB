import { Chip, type ChipTone } from './Chip';

const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  fulltext_read: { label: 'Teks lengkap dibaca', tone: 'ok' },
  page_checked: { label: 'Halaman dicek', tone: 'info' },
  doi_checked: { label: 'DOI dicek', tone: 'info' },
  unchecked: { label: 'Belum dicek', tone: 'warn' },
};

/** Judul, penulis · tahun, chip status verifikasi. */
export function LiteratureRow({ title, authors, year, doi, status }: { title: string; authors: string | null; year: number | null; doi: string | null; status: string }) {
  const s = STATUS[status] ?? STATUS.unchecked;
  return (
    <div className="px-4 py-3">
      <p className="text-[14px] font-semibold leading-snug">{title}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[12px] text-muted">
          {[authors, year].filter(Boolean).join(' · ') || 'Penulis belum diisi'}
          {doi && <> · <a href={`https://doi.org/${encodeURI(doi)}`} target="_blank" rel="noopener noreferrer" className="text-accent underline">DOI</a></>}
        </p>
        <Chip tone={s.tone}>{s.label}</Chip>
      </div>
    </div>
  );
}
