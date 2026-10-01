import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, type ControlPlaneClient } from './api/client';
import { App } from './App';
import { fakeWork } from './test/fakeWork';
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
    ...fakeWork(),
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

  it('walks client → project → sprint → task → subtask, with attachments', async () => {
    const user = userEvent.setup();
    render(<App client={fakeClient()} />);
    await screen.findByText('The agenda is clear.');
    const tabs = screen.getByLabelText('Tabs');

    // Clients
    await user.click(within(tabs).getByRole('button', { name: /Clients/ }));
    expect(await screen.findByText(/No clients yet/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('New client name'), 'Acme Co{Enter}');
    await user.click(await screen.findByRole('button', { name: /Acme Co/ }));

    // Client → a Drive link on the client, then a project
    expect(await screen.findByRole('heading', { name: 'Acme Co' })).toBeInTheDocument();
    await user.type(
      screen.getByLabelText('Paste a link'),
      'https://drive.google.com/drive/folders/abc{Enter}',
    );
    expect(await screen.findByText('Drive')).toBeInTheDocument();
    await user.type(screen.getByLabelText('New project name'), 'Website{Enter}');
    await user.click(await screen.findByRole('button', { name: /Website/ }));

    // Project → a sprint and a task in it
    expect(await screen.findByRole('heading', { name: 'Website' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+ New sprint' }));
    await user.type(screen.getByLabelText('Sprint name'), 'Sprint 1');
    await user.click(screen.getByRole('button', { name: 'Create sprint' }));
    await user.type(await screen.findByLabelText('New task in Sprint 1'), 'Homepage{Enter}');
    const sprint = await screen.findByRole('region', { name: 'Sprint 1' });
    await user.click(within(sprint).getByRole('button', { name: /Homepage/ }));

    // Task → a subtask, an uploaded file, and a status change
    expect(await screen.findByRole('heading', { name: 'Homepage' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('New subtask'), 'Hero copy{Enter}');
    expect(await screen.findByText('Hero copy')).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText('Upload files'),
      new File(['%PDF'], 'brief.pdf', { type: 'application/pdf' }),
    );
    expect(await screen.findByText('brief.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'In progress' }));
    expect(screen.getByRole('radio', { name: 'In progress' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // Breadcrumb back to the project: the task shows its subtask progress
    await user.click(
      within(screen.getByLabelText('Breadcrumb')).getByRole('button', { name: 'Website' }),
    );
    expect(await screen.findByText('0/1 subtasks')).toBeInTheDocument();

    // Tasks tab lists it as open work
    await user.click(within(tabs).getByRole('button', { name: /Tasks/ }));
    expect(await screen.findByRole('region', { name: 'Website' })).toBeInTheDocument();
  });

  it('checks off a task from the sprint list', async () => {
    const user = userEvent.setup();
    const client = fakeClient();
    const acme = await client.createClient('Acme');
    const project = await client.createProject('Site', acme.id);
    await client.createTask(project.id, { title: 'Ship it' });
    render(<App client={client} />);
    await screen.findByText('The agenda is clear.');
    await user.click(
      within(screen.getByLabelText('Sections')).getByRole('button', { name: /Projects/ }),
    );
    await user.click(await screen.findByRole('button', { name: /Site/ }));
    const box = await screen.findByRole('checkbox', { name: 'Complete Ship it' });
    await user.click(box);
    expect(box).toHaveAttribute('aria-checked', 'true');
  });
});
