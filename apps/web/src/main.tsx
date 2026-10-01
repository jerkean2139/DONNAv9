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
    <span
      title="Development identity — not real sign-in"
      className="rounded-full border border-warning/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-warning"
    >
      Dev
    </span>
  );
}

function shellFor(config: AuthConfig): ReactNode {
  if (config.auth === 'clerk') {
    return (
      <Suspense fallback={null}>
        <ClerkRoot
          publishableKey={config.clerkPublishableKey}
          planner={config.planner === true}
          gmail={config.gmail === true}
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
    return (
      <App
        client={client}
        authMode="dev"
        planner={config.planner === true}
        gmail={config.gmail === true}
        account={<DevBadge />}
      />
    );
  }
  // No sign-in configured: still show the shell; commands explain the 401.
  return <App client={new ControlPlaneClient({ baseUrl })} authMode="unconfigured" />;
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
