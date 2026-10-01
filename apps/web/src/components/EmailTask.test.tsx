import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, type ControlPlaneClient, type EmailRequest } from '../api/client';
import type { GmailStatus, OutboundEmailView, WorkItemView } from '../types';
import { EmailTask, splitDraft } from './EmailTask';

const TASK: WorkItemView = {
  id: 't1',
  projectId: 'p1',
  sprintId: null,
  parentId: null,
  title: 'Email Ana about launch',
  status: 'todo',
  dueOn: null,
  position: 0,
  owner: 'donna',
  draft: 'To: ana@acme.co\nSubject: Launch next steps\n\nHi Ana,\nWe’re ready for Monday.',
  draftStatus: 'ready',
  draftError: null,
};

function emailClient(
  status: GmailStatus,
  deliver?: (req: EmailRequest) => Promise<OutboundEmailView>,
) {
  const sent: EmailRequest[] = [];
  const client = {
    gmailStatus: vi.fn(async () => status),
    listEmails: vi.fn(async () => []),
    connectGmail: vi.fn(async () => 'https://accounts.google.com/o/oauth2/v2/auth?x=1'),
    emailTask: vi.fn(async (_id: string, req: EmailRequest) => {
      sent.push(req);
      if (deliver !== undefined) return deliver(req);
      return {
        id: `e${sent.length}`,
        workItemId: 't1',
        fromEmail: 'me@acme.co',
        to: [req.to],
        cc: [],
        subject: req.subject,
        body: req.body,
        mode: req.mode,
        status: 'done',
        error: null,
        gmailDraftId: req.mode === 'draft' ? 'd1' : null,
        createdAt: '2026-10-01T10:00:00Z',
        completedAt: '2026-10-01T10:00:01Z',
      } satisfies OutboundEmailView;
    }),
  };
  return { client: client as unknown as ControlPlaneClient, raw: client, sent };
}

const connected: GmailStatus = { configured: true, connected: true, email: 'me@acme.co' };

afterEach(() => vi.unstubAllGlobals());

describe('splitDraft', () => {
  it('pulls To/Subject lines out of Donna’s draft', () => {
    expect(splitDraft('**Subject:** Hello there\n\nBody line')).toEqual({
      to: '',
      cc: '',
      subject: 'Hello there',
      body: 'Body line',
    });
    expect(splitDraft('# Brief\n\nNo headers')).toMatchObject({
      subject: '',
      body: '# Brief\n\nNo headers',
    });
  });
});

describe('EmailTask', () => {
  it('saves Donna’s draft to Gmail drafts, prefilled from the draft', async () => {
    const user = userEvent.setup();
    const { client, sent } = emailClient(connected);
    render(<EmailTask client={client} task={TASK} />);

    await user.click(await screen.findByRole('button', { name: 'Email this draft →' }));
    expect(screen.getByLabelText('To')).toHaveValue('ana@acme.co');
    expect(screen.getByLabelText('Subject')).toHaveValue('Launch next steps');
    expect(screen.getByLabelText('Message')).toHaveValue('Hi Ana,\nWe’re ready for Monday.');
    expect(screen.getByText('From me@acme.co')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save to Gmail drafts' }));
    expect(sent).toEqual([
      expect.objectContaining({ mode: 'draft', to: 'ana@acme.co', subject: 'Launch next steps' }),
    ]);
    expect(sent[0]).not.toHaveProperty('confirm');
    expect(await screen.findByText(/In your Gmail drafts/)).toBeInTheDocument();
  });

  it('sends only after confirming who it goes to', async () => {
    const user = userEvent.setup();
    const { client, sent } = emailClient(connected);
    render(<EmailTask client={client} task={TASK} />);

    await user.click(await screen.findByRole('button', { name: 'Email this draft →' }));
    await user.clear(screen.getByLabelText('Cc'));
    await user.type(screen.getByLabelText('Cc'), 'bo@acme.co');
    await user.click(screen.getByRole('button', { name: 'Send…' }));
    expect(sent).toHaveLength(0);

    const dialog = screen.getByRole('alertdialog', { name: 'Confirm send' });
    expect(within(dialog).getByText(/to ana@acme.co, bo@acme.co\?/)).toBeInTheDocument();
    expect(within(dialog).getByText(/from me@acme.co/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Send now' }));

    expect(sent).toEqual([
      expect.objectContaining({ mode: 'send', confirm: true, to: 'ana@acme.co', cc: 'bo@acme.co' }),
    ]);
    expect(await screen.findByText(/Sent to ana@acme.co/)).toBeInTheDocument();
  });

  it('asks to connect Gmail first, and sends the browser to Google', async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const { client } = emailClient({ configured: true, connected: false, email: null });
    render(<EmailTask client={client} task={TASK} />);

    await user.click(await screen.findByRole('button', { name: 'Email this draft →' }));
    expect(screen.getByText(/I can’t read your inbox/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Connect Gmail →' }));
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1');
  });

  it('explains a failure and offers to reconnect', async () => {
    const user = userEvent.setup();
    const { client } = emailClient(connected, async () => {
      throw new ApiError(409, 'gmail_reconnect');
    });
    render(<EmailTask client={client} task={TASK} />);

    await user.click(await screen.findByRole('button', { name: 'Email this draft →' }));
    await user.click(screen.getByRole('button', { name: 'Save to Gmail drafts' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Gmail needs reconnecting');
    expect(within(alert).getByRole('button', { name: 'Reconnect →' })).toBeInTheDocument();
  });
});
