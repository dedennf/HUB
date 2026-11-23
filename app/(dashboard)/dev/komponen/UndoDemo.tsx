'use client';
import { useState } from 'react';
import { UndoToast } from '@/components/ra/UndoToast';

export function UndoDemo() {
  const [show, setShow] = useState(false);
  return (
    <>
      <button type="button" className="btn" onClick={() => setShow(true)}>Tampilkan toast</button>
      {show && <UndoToast message="Tersimpan: contoh Rp30.000 dan 1 tugas" onUndo={() => setShow(false)} onDone={() => setShow(false)} />}
    </>
  );
}
