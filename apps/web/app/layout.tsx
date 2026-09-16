import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { OfflineRuntime } from '@/components/offline/OfflineRuntime';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'NDMS',
    template: '%s · NDMS',
  },
  description: 'National Disaster Management System: one shared picture for citizens, officials, rescue teams and shelters.',
  applicationName: 'NDMS',
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
  },
  appleWebApp: { capable: true, title: 'NDMS', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <Providers>
          <OfflineRuntime />
          {children}
        </Providers>
      </body>
    </html>
  );
}
