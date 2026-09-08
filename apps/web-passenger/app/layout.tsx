import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';
import { Providers } from '../components/providers';
import './globals.css';

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
});

export const metadata: Metadata = {
  title: 'CAN-GO — Your next adventure starts here',
  description:
    'Marketplace transfers: compare driver offers, see the car before you pay, and choose price, vehicle, and driver.',
  icons: { icon: '/brand/can-go-mark.png' },
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
