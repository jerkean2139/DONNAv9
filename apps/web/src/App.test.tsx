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
    clientConfig: vi.fn().mockResolvedValue({ auth: 'unconfigured' }),
    listObjectives: vi.fn().mockResolvedValue([]),
    listObjectiveEvents: vi.fn().mockResolvedValue([]),
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

  it('opens the kitchen thread for an objective with its recorded steps', async () => {
    const user = userEvent.setup();
    const client = fakeClient({
      listObjectives: vi
        .fn()
        .mockResolvedValue([{ id: 'o1', requestedOutcome: 'Ship Route 40', status: 'active' }]),
      listObjectiveEvents: vi.fn().mockResolvedValue([
        {
          id: 'e1',
          type: 'objective.created',
          actor: { type: 'human', id: 'u1' },
          createdAt: '2026-10-01T12:00:00.000Z',
        },
        {
          id: 'e2',
          type: 'task.completed',
          actor: { type: 'adapter', id: 'anthropic' },
          createdAt: '2026-10-01T12:01:00.000Z',
          taskId: 'abcdef1234567890',
        },
      ]),
    });
    render(<App client={client} />);
    await user.click(await screen.findByRole('button', { name: /Ship Route 40/ }));

    const thread = await screen.findByLabelText('Kitchen thread');
    expect(client.listObjectiveEvents).toHaveBeenCalledWith('o1');
    expect(await within(thread).findByText(/Opened this objective/)).toBeInTheDocument();
    expect(within(thread).getByText('Worker · anthropic')).toBeInTheDocument();
    expect(within(thread).getByText('Finished the task.')).toBeInTheDocument();
    expect(within(thread).getByText('task abcdef12')).toBeInTheDocument();

    await user.click(within(thread).getByRole('button', { name: 'Close' }));
    expect(screen.queryByLabelText('Kitchen thread')).not.toBeInTheDocument();
  });

  it('toggles the kitchen from the header and explains an empty selection', async () => {
    const user = userEvent.setup();
    render(<App client={fakeClient()} />);
    await screen.findByText('ok');
    const toggle = screen.getByRole('button', { name: 'Kitchen' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Pick an objective/)).toBeInTheDocument();
  });

  it('explains a kitchen thread the API refuses', async () => {
    const user = userEvent.setup();
    const client = fakeClient({
      listObjectives: vi
        .fn()
        .mockResolvedValue([{ id: 'o1', requestedOutcome: 'Ship Route 40', status: 'active' }]),
      listObjectiveEvents: vi.fn().mockRejectedValue(new ApiError(401, 'missing_bearer_token')),
    });
    render(<App client={client} />);
    await user.click(await screen.findByRole('button', { name: /Ship Route 40/ }));
    const thread = await screen.findByLabelText('Kitchen thread');
    expect(await within(thread).findByRole('alert')).toHaveTextContent('Not signed in');
  });
});
