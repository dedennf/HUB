import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Hub Pribadi', template: '%s · Hub Pribadi' },
  description: 'Kuliah, riset, dan keuangan pribadi dalam satu aplikasi',
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg', apple: '/icon-180.png' },
  appleWebApp: { capable: true, title: 'Hub Pribadi', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0e7c6b' },
    { media: '(prefers-color-scheme: dark)', color: '#121517' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
