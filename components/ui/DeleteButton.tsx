'use client';

/** Tombol hapus dengan konfirmasi peramban. `action` adalah server action (FormData). */
export function DeleteButton({ action, id, back, label, confirmText }: { action: (fd: FormData) => Promise<void>; id: string; back: string; label: string; confirmText: string }) {
  return (
    <form action={action} onSubmit={(e) => { if (!confirm(confirmText)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
      <button className="btn btn-danger">{label}</button>
    </form>
  );
}
