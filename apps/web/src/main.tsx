import { StrictMode, lazy, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { ControlPlaneClient, devPrincipalHeaders, type AuthConfig } from './api/client';
import { App } from './App';
import './index.css';

const ClerkRoot = lazy(() => import('./ClerkRoot'));

const root = document.getElementById('root');
if (root === null) throw new Error('#root not found');

// Same-origin: the control-plane serves this app. VITE_API_URL points a local
// `vite dev` server at a separately running API.
const baseUrl = import.meta.env.VITE_API_URL ?? '';

function DevBadge() {
  return (
    <span className="rounded border border-amber-400/50 px-1.5 py-0.5 text-amber-400">
      dev identity
    </span>
  );
}

function shellFor(config: AuthConfig): ReactNode {
  if (config.auth === 'clerk') {
    return (
      <Suspense fallback={null}>
        <ClerkRoot
          publishableKey={config.clerkPublishableKey}
          {...(config.clerkJwtTemplate !== undefined
            ? { jwtTemplate: config.clerkJwtTemplate }
            : {})}
        />
      </Suspense>
    );
  }
  if (config.auth === 'dev') {
    const client = new ControlPlaneClient({
      baseUrl,
      principalHeaders: devPrincipalHeaders(config.devPrincipal),
    });
    return <App client={client} account={<DevBadge />} />;
  }
  // No sign-in configured: still show the shell; commands explain the 401.
  return <App client={new ControlPlaneClient({ baseUrl })} />;
}

async function boot(): Promise<ReactNode> {
  try {
    return shellFor(await new ControlPlaneClient({ baseUrl }).clientConfig());
  } catch {
    return shellFor({ auth: 'unconfigured' });
  }
}

void boot().then((shell) => {
  createRoot(root).render(<StrictMode>{shell}</StrictMode>);
});
