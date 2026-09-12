import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';
import { Providers } from '../components/providers';
import './globals.css';

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
});

export const metadata: Metadata = {
  title: 'CAN-RIDE — Your marketplace for every ride',
  description:
    'Marketplace transfers: compare driver offers, see the car before you pay, and choose price, vehicle, and driver.',
  icons: { icon: '/brand/can-ride-mark.png' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={roboto.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
