'use client';
import { deleteTransaction } from './actions';

export function DeleteTransactionButton({ id }: { id: string }) {
  return (
    <form action={deleteTransaction} onSubmit={(e) => { if (!confirm('Hapus transaksi ini? Saldo akun akan disesuaikan.')) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-danger">Hapus transaksi</button>
    </form>
  );
}
