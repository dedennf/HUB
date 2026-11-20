import Link from 'next/link';
import { RealtimeRefresher } from '@/components/RealtimeRefresher';
import { ServiceWorker } from '@/components/ServiceWorker';
import { SideNav, TabBar } from '@/components/Nav';
import { requireUser } from '@/lib/auth';

export default async function DashboardLayout({ children }: LayoutProps<'/'>) {
  await requireUser();
  return (
    <div className="flex min-h-dvh">
      <SideNav />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-end gap-2 px-4 pt-3">
          <RealtimeRefresher />
          <Link href="/pengaturan" className="chip md:hidden">Pengaturan</Link>
        </div>
        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-2 md:pb-10">{children}</main>
      </div>
      <TabBar />
      <ServiceWorker />
    </div>
  );
}
