'use client';

/** Load Google Identity Services and return an ID token via One Tap / button prompt. */
export async function promptGoogleIdToken(clientId: string): Promise<string> {
  await loadScript('https://accounts.google.com/gsi/client', 'google-gsi');
  const google = (window as unknown as { google?: GoogleAccounts }).google;
  if (!google?.accounts?.id) {
    throw new Error('Google Identity Services failed to load');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) {
          finish(() => resolve(response.credential!));
        } else {
          finish(() => reject(new Error('Google sign-in was cancelled')));
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // Fallback: render a temporary button and click it programmatically
        const host = document.createElement('div');
        host.style.position = 'fixed';
        host.style.left = '-9999px';
        document.body.appendChild(host);
        google.accounts.id.renderButton(host, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
        });
        const btn = host.querySelector('div[role="button"]') as HTMLElement | null;
        if (btn) {
          btn.click();
        } else {
          finish(() =>
            reject(
              new Error(
                'Google sign-in UI unavailable. Check the OAuth client ID and authorized origins.',
              ),
            ),
          );
        }
        setTimeout(() => host.remove(), 5000);
      }
    });

    setTimeout(() => {
      finish(() => reject(new Error('Google sign-in timed out')));
    }, 120_000);
  });
}

/** Sign in with Apple JS SDK; returns identity token (+ optional name on first grant). */
export async function promptAppleIdToken(clientId: string): Promise<{
  idToken: string;
  fullName?: string;
  email?: string;
}> {
  await loadScript(
    'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js',
    'apple-auth',
  );
  const AppleID = (window as unknown as { AppleID?: AppleIDGlobal }).AppleID;
  if (!AppleID?.auth) {
    throw new Error('Apple Sign In SDK failed to load');
  }

  AppleID.auth.init({
    clientId,
    scope: 'name email',
    redirectURI: window.location.origin,
    usePopup: true,
  });

  const res = await AppleID.auth.signIn();
  const idToken = res.authorization?.id_token;
  if (!idToken) throw new Error('Apple sign-in was cancelled');

  const nameParts = [res.user?.name?.firstName, res.user?.name?.lastName].filter(
    Boolean,
  ) as string[];
  return {
    idToken,
    fullName: nameParts.length ? nameParts.join(' ') : undefined,
    email: res.user?.email,
  };
}

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error(`Failed to load ${src}`)),
      );
      return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

type GoogleAccounts = {
  accounts: {
    id: {
      initialize: (cfg: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }) => void;
      prompt: (cb?: (n: {
        isNotDisplayed: () => boolean;
        isSkippedMoment: () => boolean;
      }) => void) => void;
      renderButton: (
        parent: HTMLElement,
        options: Record<string, string>,
      ) => void;
    };
  };
};

type AppleIDGlobal = {
  auth: {
    init: (cfg: {
      clientId: string;
      scope: string;
      redirectURI: string;
      usePopup: boolean;
    }) => void;
    signIn: () => Promise<{
      authorization?: { id_token?: string };
      user?: {
        email?: string;
        name?: { firstName?: string; lastName?: string };
      };
    }>;
  };
};
