import { PrivacyProvider } from '@/components/providers/PrivacyProvider';
import { RaProvider } from '@/components/providers/RaProvider';
import { ThemeSync } from '@/components/providers/ThemeSync';
import { RaPanel } from '@/components/ra/RaPanel';
import { RaSheet } from '@/components/ra/RaSheet';
import { RealtimeRefresher } from '@/components/RealtimeRefresher';
import { ServiceWorker } from '@/components/ServiceWorker';
import { BottomNav } from '@/components/shell/BottomNav';
import { Sidebar } from '@/components/shell/Sidebar';
import { requireUser } from '@/lib/auth';
import { db, getSettings } from '@/lib/data';
import { readTheme } from '@/lib/settings';

/**
 * Kerangka Kompas (DESIGN 5).
 * HP (< 1024 px): konten + navigasi bawah lima slot + sheet Ra.
 * Laptop: sidebar 240 px · konten (maks 1440 px) · panel Ra 360 px. Bila sempit, panel Ra turun ke bawah.
 */
export default async function DashboardLayout({ children }: LayoutProps<'/'>) {
  await requireUser();
  const settings = await getSettings(await db(), ['theme']);
  return (
    <PrivacyProvider>
      <RaProvider>
        <ThemeSync theme={readTheme(settings.theme)} />
        <div className="flex min-h-dvh flex-wrap lg:flex-nowrap">
          <Sidebar />
          <div className="min-w-0 flex-1 lg:min-w-[560px]">
            <main className="mx-auto w-full max-w-[1440px] px-5 pb-32 pt-5 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
          </div>
          <RaPanel />
        </div>
        <RealtimeRefresher />
        <BottomNav />
        <RaSheet />
        <ServiceWorker />
      </RaProvider>
    </PrivacyProvider>
  );
}
