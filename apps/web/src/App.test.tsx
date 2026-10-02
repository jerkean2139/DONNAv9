import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, type ControlPlaneClient } from './api/client';
import { App } from './App';
import { fakeWork } from './test/fakeWork';
import type { ObjectiveView, PlanRecordView, PlanView } from './types';

function fakeClient(overrides: Partial<ControlPlaneClient> = {}): ControlPlaneClient {
  let seq = 0;
  return {
    health: vi.fn().mockResolvedValue({ status: 'ok' }),
    clientConfig: vi.fn().mockResolvedValue({ auth: 'dev' }),
    listObjectives: vi.fn().mockResolvedValue([]),
    listObjectiveEvents: vi.fn().mockResolvedValue([]),
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

  describe('Donna planning', () => {
    const PLAN: PlanView = {
      summary: 'I’ll run the relaunch as a two-week sprint.',
      client: { kind: 'new', name: 'Acme Co' },
      project: { kind: 'new', name: 'Website relaunch' },
      sprint: { name: 'Launch sprint', startsOn: '2026-10-05', endsOn: '2026-10-16' },
      tasks: [
        { title: 'Draft launch email', subtasks: ['Subject', 'Body'], owner: 'donna' },
        { title: 'Confirm DNS cutover', subtasks: [], owner: 'you' },
      ],
      questions: ['Which domain?'],
    };

    /** A fake API whose plan moves drafting → proposed → approved. */
    function planningClient(initial: PlanRecordView['status'] = 'proposed') {
      const objectives: ObjectiveView[] = [];
      const record = (objectiveId: string, status: PlanRecordView['status']): PlanRecordView => ({
        id: 'plan1',
        objectiveId,
        status,
        plan: status === 'drafting' ? null : PLAN,
        error: status === 'failed' ? 'declined' : null,
        projectId: status === 'approved' ? 'p1' : null,
      });
      const client = fakeClient({
        listObjectives: vi.fn(async () => objectives.map((o) => ({ ...o }))),
        createObjective: vi.fn(async ({ requestedOutcome }: { requestedOutcome: string }) => {
          const objective: ObjectiveView = {
            id: 'o1',
            requestedOutcome,
            status: 'draft',
            plan: null,
          };
          objectives.unshift(objective);
          return { status: 'created' as const, objective };
        }),
        startPlan: vi.fn(async (id: string) => {
          const plan = record(id, initial);
          objectives[0] = { ...objectives[0]!, plan };
          return plan;
        }),
        approvePlan: vi.fn(async (id: string) => {
          const plan = record(id, 'approved');
          objectives[0] = {
            ...objectives[0]!,
            status: 'active',
            plan,
            progress: { done: 0, total: 3 },
          };
          return { plan, projectId: 'p1' };
        }),
        dismissPlan: vi.fn(async (id: string) => record(id, 'dismissed')),
      });
      return client;
    }

    it('hands a typed outcome to Donna and approves her plan', async () => {
      const user = userEvent.setup();
      const client = planningClient();
      render(<App client={client} planner />);
      await screen.findByText('The agenda is clear.');
      await user.type(screen.getByLabelText('Command Donna'), 'Relaunch the Acme site{Enter}');

      expect(client.startPlan).toHaveBeenCalledWith(
        'o1',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
      const card = await screen.findByRole('region', { name: 'Donna’s plan' });
      expect(within(card).getByText(PLAN.summary)).toBeInTheDocument();
      expect(
        within(card).getByText(/Acme Co \(new\) \/ Website relaunch \(new\) \/ Launch sprint/),
      ).toBeInTheDocument();
      expect(within(card).getByText('I’ll draft this')).toBeInTheDocument();
      expect(within(card).getByText('Which domain?')).toBeInTheDocument();

      await user.click(within(card).getByRole('button', { name: 'Approve plan' }));
      expect(client.approvePlan).toHaveBeenCalledWith('o1', [0, 1]);
      expect(
        await screen.findByText(/Planned into Acme Co \/ Website relaunch/),
      ).toBeInTheDocument();
      expect(screen.getByText('0/3 done')).toBeInTheDocument();
    });

    it('lets you leave tasks out before approving', async () => {
      const user = userEvent.setup();
      const client = planningClient();
      render(<App client={client} planner />);
      await screen.findByText('The agenda is clear.');
      await user.type(screen.getByLabelText('Command Donna'), 'Relaunch{Enter}');
      const card = await screen.findByRole('region', { name: 'Donna’s plan' });
      await user.click(within(card).getByRole('checkbox', { name: 'Include Confirm DNS cutover' }));
      await user.click(within(card).getByRole('button', { name: 'Approve 1 task' }));
      expect(client.approvePlan).toHaveBeenCalledWith('o1', [0]);
    });

    it('shows drafting progress, and explains a failure with a retry', async () => {
      const user = userEvent.setup();
      const client = planningClient('failed');
      render(<App client={client} planner />);
      await screen.findByText('The agenda is clear.');
      await user.type(screen.getByLabelText('Command Donna'), 'Something odd{Enter}');
      expect(await screen.findByText(/tripped my safety checks/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Try again →' }));
      expect(client.startPlan).toHaveBeenLastCalledWith('o1', expect.any(String), true);
    });

    it('says when planning is not switched on', async () => {
      const client = planningClient();
      render(<App client={client} planner={false} />);
      expect(await screen.findByRole('note', { name: 'Planning' })).toHaveTextContent(
        'ANTHROPIC_API_KEY',
      );
    });
  });
});

describe('Gmail connection result', () => {
  it('announces the OAuth result and clears it from the URL', async () => {
    window.history.pushState(null, '', '/?gmail=connected');
    render(<App client={fakeClient()} gmail />);
    expect(await screen.findByText(/Gmail connected/)).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('explains a declined connection', async () => {
    window.history.pushState(null, '', '/?gmail=scope');
    render(<App client={fakeClient()} gmail />);
    expect(await screen.findByText(/allow “compose and send”/)).toBeInTheDocument();
    window.history.pushState(null, '', '/');
  });
});

describe('Kitchen thread', () => {
  const objective: ObjectiveView = {
    id: 'o1',
    requestedOutcome: 'Ship Route 40',
    status: 'active',
  };

  it('opens the recorded work behind an objective, with Donna’s plan', async () => {
    const user = userEvent.setup();
    const client = fakeClient({
      listObjectives: vi.fn().mockResolvedValue([
        {
          ...objective,
          plan: {
            id: 'p1',
            objectiveId: 'o1',
            status: 'proposed',
            plan: {
              summary: 'Two steps to launch',
              client: { kind: 'none' },
              project: { kind: 'new', name: 'Route 40' },
              sprint: null,
              tasks: [
                { title: 'A', subtasks: [], owner: 'you' },
                { title: 'B', subtasks: [], owner: 'donna' },
              ],
              questions: [],
            },
            error: null,
            projectId: null,
          },
        },
      ]),
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
    await user.click(await screen.findByRole('button', { name: 'In the kitchen: Ship Route 40' }));

    const thread = await screen.findByLabelText('Kitchen thread');
    expect(client.listObjectiveEvents).toHaveBeenCalledWith('o1');
    const messages = await within(thread).findByLabelText('Thread messages');
    const items = within(messages).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('“Ship Route 40”');
    expect(items[1]).toHaveTextContent('Proposed a plan with 2 tasks: Two steps to launch');
    expect(items[2]).toHaveTextContent('Worker · anthropic');
    expect(items[2]).toHaveTextContent('Finished the task.');
    expect(items[2]).toHaveTextContent('task abcdef12');

    await user.click(within(thread).getByRole('button', { name: 'Close' }));
    expect(screen.queryByLabelText('Kitchen thread')).not.toBeInTheDocument();
  });

  it('switches to the agent room and expands the pane', async () => {
    const user = userEvent.setup();
    const client = fakeClient({ listObjectives: vi.fn().mockResolvedValue([objective]) });
    render(<App client={client} />);
    await user.click(await screen.findByRole('button', { name: 'In the kitchen: Ship Route 40' }));
    const thread = await screen.findByLabelText('Kitchen thread');

    await user.click(within(thread).getByRole('tab', { name: 'Agent room' }));
    expect(within(thread).getByText(/Sample run/)).toBeInTheDocument();
    expect(within(thread).getByLabelText('Agent conversation')).toBeInTheDocument();

    await user.click(within(thread).getByRole('button', { name: 'Expand' }));
    expect(within(thread).getByRole('button', { name: 'Full screen' })).toBeInTheDocument();
  });

  it('explains a thread the API refuses', async () => {
    const user = userEvent.setup();
    const client = fakeClient({
      listObjectives: vi.fn().mockResolvedValue([objective]),
      listObjectiveEvents: vi.fn().mockRejectedValue(new ApiError(401, 'missing_bearer_token')),
    });
    render(<App client={client} />);
    await user.click(await screen.findByRole('button', { name: 'In the kitchen: Ship Route 40' }));
    const thread = await screen.findByLabelText('Kitchen thread');
    expect(await within(thread).findByRole('alert')).toHaveTextContent('Not signed in');
  });
});
