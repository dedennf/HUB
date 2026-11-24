import { Skeleton } from '@/components/ui/Skeleton';

/** Keadaan memuat semua halaman dashboard. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Memuat">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-56" />
      <div className="card flex flex-col gap-3 p-4"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-8 w-1/2" /><Skeleton className="h-3 w-2/3" /></div>
      <div className="card flex flex-col gap-3 p-4"><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-3/4" /></div>
    </div>
  );
}
