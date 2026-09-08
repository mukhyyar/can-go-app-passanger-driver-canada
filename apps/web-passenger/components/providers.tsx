'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from './auth-provider';
import { ImpersonationBanner } from './impersonation-banner';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ImpersonationBanner />
      {children}
    </AuthProvider>
  );
}
