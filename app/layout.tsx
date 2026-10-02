import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { APP_NAME, TAGLINE } from '@/lib/constants';
import TitleBar from '@/components/shell/TitleBar';
import Bienvenida from '@/components/ui/Bienvenida';
import { themeInitScript } from '@/lib/theme';
import { windowChromeInitScript } from '@/lib/windowChrome';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['opsz', 'SOFT'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: TAGLINE,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme lo fija el script inline antes de pintar; por eso se suprime el aviso de hidratación.
    <html lang="es" data-theme="dia" className={`${fraunces.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: windowChromeInitScript }} />
      </head>
      <body>
        <div id="vuelo-marco">
          <div id="vuelo-scroll">{children}</div>
        </div>
        <TitleBar />
        <Bienvenida />
      </body>
    </html>
  );
}
