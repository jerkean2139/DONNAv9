import {
  ClerkLoading,
  ClerkProvider,
  SignIn,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
} from '@clerk/clerk-react';
import { useMemo, useRef } from 'react';

import { ControlPlaneClient } from './api/client';
import { App } from './App';
import { DonnaAvatar } from './components/DonnaAvatar';

interface Props {
  publishableKey: string;
  planner: boolean;
  gmail: boolean;
  /** Clerk JWT template for API tokens, when the API expects one. */
  jwtTemplate?: string;
}

function SignedInApp({
  jwtTemplate,
  planner,
  gmail,
}: {
  jwtTemplate?: string;
  planner: boolean;
  gmail: boolean;
}) {
  const { getToken } = useAuth();
  // Keep the latest getToken without rebuilding the client (and refetching).
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const client = useMemo(
    () =>
      new ControlPlaneClient({
        baseUrl: '',
        authHeaders: async () => {
          const token = await getTokenRef.current(
            jwtTemplate !== undefined ? { template: jwtTemplate } : undefined,
          );
          return token === null ? {} : { authorization: `Bearer ${token}` };
        },
      }),
    [jwtTemplate],
  );

  return (
    <App
      client={client}
      authMode="clerk"
      planner={planner}
      gmail={gmail}
      account={<UserButton />}
    />
  );
}

/**
 * Production shell: Clerk owns sign-in and MFA; the API verifies the Clerk JWT
 * and resolves the principal from DONNA's own tables (Technical Plan §6/§8).
 * Loaded lazily so development builds never pull in Clerk.
 */
export default function ClerkRoot({ publishableKey, jwtTemplate, planner, gmail }: Props) {
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkLoading>
        <div className="flex h-dvh items-center justify-center bg-surface font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          Loading sign-in…
        </div>
      </ClerkLoading>
      <SignedIn>
        <SignedInApp
          planner={planner}
          gmail={gmail}
          {...(jwtTemplate !== undefined ? { jwtTemplate } : {})}
        />
      </SignedIn>
      <SignedOut>
        <div className="grain ember-wash safe-top safe-bottom flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface px-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <DonnaAvatar size={72} />
            <div className="font-serif text-[40px] leading-none text-ink">
              Hello, <em className="text-accent">you</em>.
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Sign in to your daily brief
            </p>
          </div>
          <SignIn />
        </div>
      </SignedOut>
    </ClerkProvider>
  );
}
