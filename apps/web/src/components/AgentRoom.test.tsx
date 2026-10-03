import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SAMPLE_AGENT_RUN } from '../data/sampleAgentRun';
import { AgentRoom } from './AgentRoom';

describe('AgentRoom', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('labels a sample run and plays it message by message', async () => {
    render(<AgentRoom run={SAMPLE_AGENT_RUN} sample />);
    expect(screen.getByText(/Sample run/)).toBeInTheDocument();
    const thread = screen.getByLabelText('Agent conversation');
    expect(within(thread).getAllByRole('listitem')).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });
    expect(within(thread).getAllByRole('listitem')).toHaveLength(2);
    // Scout joins the roster once Donna spins it up.
    expect(screen.getByRole('button', { name: /Scout, Discovery analyst/ })).toBeInTheDocument();
  });

  it('shows everything, highlights @tags, and opens an agent profile', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AgentRoom run={SAMPLE_AGENT_RUN} sample />);
    await user.click(screen.getByRole('button', { name: 'Show all' }));

    const thread = screen.getByLabelText('Agent conversation');
    expect(within(thread).getAllByRole('listitem')).toHaveLength(SAMPLE_AGENT_RUN.messages.length);
    expect(within(thread).getAllByText('@Sentinel').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Replay' })).toBeInTheDocument();

    await user.hover(screen.getByRole('button', { name: /Flow, Zenoflo architect/ }));
    const card = screen.getByRole('tooltip');
    expect(card).toHaveTextContent('Every lead lands in the right pipeline stage');
    expect(card).toHaveTextContent('Speed-to-lead nurture');
    expect(card).toHaveTextContent('$2.50');
  });
});
