import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, type ControlPlaneClient } from './api/client';
import { App } from './App';
import type { ObjectiveView } from './types';

function fakeClient(overrides: Partial<ControlPlaneClient> = {}): ControlPlaneClient {
  let seq = 0;
  return {
    health: vi.fn().mockResolvedValue({ status: 'ok' }),
    clientConfig: vi.fn().mockResolvedValue({ auth: 'unconfigured' }),
    listObjectives: vi.fn().mockResolvedValue([]),
    createObjective: vi.fn(async ({ requestedOutcome }: { requestedOutcome: string }) => {
      seq += 1;
      const objective: ObjectiveView = { id: `o${seq}`, requestedOutcome, status: 'draft' };
      return { status: 'created' as const, objective };
    }),
    ...overrides,
  } as unknown as ControlPlaneClient;
}

describe('App shell', () => {
  it('renders the command-first regions', async () => {
    render(<App client={fakeClient()} />);
    await screen.findByText('ok');
    expect(screen.getByLabelText('Context')).toBeInTheDocument();
    expect(screen.getByLabelText('Active workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Donna rail')).toBeInTheDocument();
    expect(screen.getByLabelText('Command Donna')).toBeInTheDocument();
  });

  it('shows live control-plane health', async () => {
    render(<App client={fakeClient()} />);
    expect(await screen.findByText('ok')).toBeInTheDocument();
  });

  it('loads existing objectives from the API', async () => {
    const client = fakeClient({
      listObjectives: vi
        .fn()
        .mockResolvedValue([{ id: 'o1', requestedOutcome: 'Ship Route 40', status: 'active' }]),
    });
    render(<App client={client} />);
    expect(await screen.findAllByText('Ship Route 40')).not.toHaveLength(0);
  });

  it('creates an objective through the API from a typed command', async () => {
    const user = userEvent.setup();
    const client = fakeClient();
    render(<App client={client} />);
    const input = screen.getByLabelText('Command Donna');
    await user.type(input, 'Launch the new site{Enter}');

    expect(client.createObjective).toHaveBeenCalledWith(
      expect.objectContaining({ requestedOutcome: 'Launch the new site' }),
    );
    expect(await screen.findByText('Objective created.')).toBeInTheDocument();
    expect(screen.getAllByText('Launch the new site')).not.toHaveLength(0);
    expect(input).toHaveValue('');
  });

  it('keeps the command and explains when the API refuses it', async () => {
    const user = userEvent.setup();
    const client = fakeClient({
      createObjective: vi.fn().mockRejectedValue(new ApiError(401, 'missing_bearer_token')),
    });
    render(<App client={client} />);
    const input = screen.getByLabelText('Command Donna');
    await user.type(input, 'Launch the new site{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Not signed in');
    expect(input).toHaveValue('Launch the new site');
  });

  it('switches the active context section', async () => {
    const user = userEvent.setup();
    render(<App client={fakeClient()} />);
    await screen.findByText('ok');
    await user.click(screen.getByRole('button', { name: 'Leads' }));
    expect(screen.getByRole('heading', { name: 'Leads' })).toBeInTheDocument();
  });
});
