import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, type ControlPlaneClient } from './api/client';
import { App } from './App';
import type { ObjectiveView } from './types';

function fakeClient(overrides: Partial<ControlPlaneClient> = {}): ControlPlaneClient {
  let seq = 0;
  return {
    health: vi.fn().mockResolvedValue({ status: 'ok' }),
    clientConfig: vi.fn().mockResolvedValue({ auth: 'dev' }),
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
  it('renders navigation, the workspace and the command composer', async () => {
    render(<App client={fakeClient()} />);
    expect(screen.getByLabelText('Sections')).toBeInTheDocument();
    expect(screen.getByLabelText('Tabs')).toBeInTheDocument();
    expect(screen.getByLabelText('Workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Command Donna')).toBeInTheDocument();
    expect(await screen.findByText('The agenda is clear.')).toBeInTheDocument();
  });

  it('shows Donna as online from the live health check', async () => {
    render(<App client={fakeClient()} />);
    expect((await screen.findAllByText('Online')).length).toBeGreaterThan(0);
  });

  it('loads existing objectives from the API', async () => {
    const client = fakeClient({
      listObjectives: vi
        .fn()
        .mockResolvedValue([{ id: 'o1', requestedOutcome: 'Ship Route 40', status: 'active' }]),
    });
    render(<App client={client} />);
    const list = await screen.findByRole('list', { name: 'Objectives' });
    expect(within(list).getByText('Ship Route 40')).toBeInTheDocument();
    expect(within(list).getByText('In motion')).toBeInTheDocument();
  });

  it('creates an objective through the API from a typed command', async () => {
    const user = userEvent.setup();
    const client = fakeClient();
    render(<App client={client} />);
    await screen.findByText('The agenda is clear.');
    const input = screen.getByLabelText('Command Donna');
    await user.type(input, 'Launch the new site{Enter}');

    expect(client.createObjective).toHaveBeenCalledWith(
      expect.objectContaining({ requestedOutcome: 'Launch the new site' }),
    );
    expect(await screen.findByText('Got it — it’s on the agenda.')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Objectives' });
    expect(within(list).getByText('Launch the new site')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('fills the composer from a suggestion', async () => {
    const user = userEvent.setup();
    render(<App client={fakeClient()} />);
    await user.click(await screen.findByRole('button', { name: 'Plan next week’s priorities' }));
    expect(screen.getByLabelText('Command Donna')).toHaveValue('Plan next week’s priorities');
  });

  it('keeps the command and explains when the API refuses it', async () => {
    const user = userEvent.setup();
    const client = fakeClient({
      createObjective: vi.fn().mockRejectedValue(new ApiError(401, 'missing_bearer_token')),
    });
    render(<App client={client} />);
    await screen.findByText('The agenda is clear.');
    const input = screen.getByLabelText('Command Donna');
    await user.type(input, 'Launch the new site{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Not signed in');
    expect(input).toHaveValue('Launch the new site');
  });

  it('explains missing sign-in up front and disables commands', async () => {
    const client = fakeClient();
    render(<App client={client} authMode="unconfigured" />);
    expect(screen.getByRole('note')).toHaveTextContent('Sign-in isn’t set up yet');
    expect(screen.getByRole('note')).toHaveTextContent('CLERK_PUBLISHABLE_KEY');
    expect(screen.getByLabelText('Command Donna')).toBeDisabled();
    expect(client.listObjectives).not.toHaveBeenCalled();
    await screen.findAllByText('Online');
  });

  it('shows a not-connected state for sections without live data', async () => {
    const user = userEvent.setup();
    render(<App client={fakeClient()} />);
    await screen.findByText('The agenda is clear.');
    const sidebar = screen.getByLabelText('Sections');
    await user.click(within(sidebar).getByRole('button', { name: /Leads/ }));
    expect(screen.getByRole('heading', { name: 'Leads' })).toBeInTheDocument();
    expect(screen.getByText('Not connected yet')).toBeInTheDocument();
  });

  it('lists overflow sections under More on phones', async () => {
    const user = userEvent.setup();
    render(<App client={fakeClient()} />);
    await screen.findByText('The agenda is clear.');
    const tabs = screen.getByLabelText('Tabs');
    await user.click(within(tabs).getByRole('button', { name: /More/ }));
    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument();
    const workspace = screen.getByLabelText('Workspace');
    expect(within(workspace).getByRole('button', { name: /Automations/ })).toBeInTheDocument();
  });
});
