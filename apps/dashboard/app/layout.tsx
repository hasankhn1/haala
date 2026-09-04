import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { ApiTargetBanner } from '@/components/ApiTargetBanner';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Haala Ops',
  description: 'Operations dashboard for Haala quick-commerce',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/*
          Outside `Providers` and above every shell, so it covers the ops
          dashboard, the vendor dashboard and /login alike. Renders nothing
          when the API is local.
        */}
        <ApiTargetBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
