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

interface Props {
  publishableKey: string;
  /** Clerk JWT template for API tokens, when the API expects one. */
  jwtTemplate?: string;
}

function SignedInApp({ jwtTemplate }: { jwtTemplate?: string }) {
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

  return <App client={client} account={<UserButton />} />;
}

/**
 * Production shell: Clerk owns sign-in and MFA; the API verifies the Clerk JWT
 * and resolves the principal from DONNA's own tables (Technical Plan §6/§8).
 * Loaded lazily so development builds never pull in Clerk.
 */
export default function ClerkRoot({ publishableKey, jwtTemplate }: Props) {
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkLoading>
        <div className="flex h-screen items-center justify-center bg-surface text-sm text-muted">
          Loading sign-in…
        </div>
      </ClerkLoading>
      <SignedIn>
        <SignedInApp {...(jwtTemplate !== undefined ? { jwtTemplate } : {})} />
      </SignedIn>
      <SignedOut>
        <div className="flex h-screen items-center justify-center bg-surface">
          <SignIn />
        </div>
      </SignedOut>
    </ClerkProvider>
  );
}
