import './globals.css';
import { AuthProvider } from '../lib/auth';
import { ToastProvider } from '../components/toast';

export const metadata = {
  title: 'CAN-RIDE Admin Ops',
  description: 'CAN-RIDE marketplace control plane',
  icons: { icon: '/brand/can-ride-mark.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
