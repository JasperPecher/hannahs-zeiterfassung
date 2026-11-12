import type { Metadata } from 'next';
import { siteTitle } from '../site-title';
import './globals.css';

export function generateMetadata(): Metadata {
  return {
    title: siteTitle(),
    robots: { index: false, follow: false },
    description: 'Arbeitszeiten pro Mandant erfassen und abrechnen.',
  };
}

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}
