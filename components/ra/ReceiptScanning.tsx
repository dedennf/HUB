import { Skeleton } from '@/components/ui/Skeleton';
import { RaMark } from './RaMark';

/** Pratinjau struk dengan garis pindai, teks status, dan skeleton hasil. */
export function ReceiptScanning({ imageUrl }: { imageUrl?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="card relative h-60 overflow-hidden p-4">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="Pratinjau struk" className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col gap-2.5 px-6 pt-2">{[70, 40, 85, 40, 70, 85].map((w, i) => <Skeleton key={i} className="h-2.5" style={{ width: `${w}%` }} />)}</div>
        )}
        <span className="anim-scan absolute inset-x-3 h-0.5 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" aria-hidden="true" />
      </div>
      <p className="flex items-center gap-2 text-[13px] font-semibold" role="status"><RaMark size={14} /> Ra sedang membaca struk...</p>
      <div className="card flex flex-col gap-2.5 p-4">
        <Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-5/6" />
      </div>
    </div>
  );
}
