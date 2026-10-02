import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, type ControlPlaneClient } from '../api/client';
import type { ClientView } from '../types';
import { ClientsView } from './ClientsView';

const demo: ClientView = {
  id: 'c1',
  name: 'Summit Ridge Roofing (Demo)',
  status: 'active',
  notes: 'Demo client: fictional data for demos. Family-owned roofing company.',
  projectCount: 3,
  createdAt: '2026-10-02T00:00:00Z',
};

function fake(overrides: Partial<ControlPlaneClient>): ControlPlaneClient {
  return {
    listClients: vi.fn().mockResolvedValue([]),
    loadDemo: vi.fn().mockResolvedValue({ seeded: {} }),
    removeDemo: vi.fn().mockResolvedValue({ removedClients: 1 }),
    ...overrides,
  } as unknown as ControlPlaneClient;
}

describe('ClientsView demo data', () => {
  it('loads the demo client and shows it', async () => {
    const user = userEvent.setup();
    const listClients = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([demo]);
    const client = fake({ listClients });
    render(<ClientsView client={client} navigate={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Load demo client →' }));
    expect(client.loadDemo).toHaveBeenCalled();
    expect(await screen.findByText('Summit Ridge Roofing (Demo)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove demo' })).toBeInTheDocument();
  });

  it('removes it when it is there', async () => {
    const user = userEvent.setup();
    const listClients = vi.fn().mockResolvedValueOnce([demo]).mockResolvedValue([]);
    const client = fake({ listClients });
    render(<ClientsView client={client} navigate={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Remove demo' }));
    expect(client.removeDemo).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Load demo client →' })).toBeInTheDocument();
  });

  it('explains when a non-admin tries', async () => {
    const user = userEvent.setup();
    const client = fake({
      loadDemo: vi.fn().mockRejectedValue(new ApiError(403, 'admin_required')),
    });
    render(<ClientsView client={client} navigate={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Load demo client →' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only an admin');
  });
});
