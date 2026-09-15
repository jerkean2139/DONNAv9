import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App shell', () => {
  it('renders the command-first regions', () => {
    render(<App />);
    expect(screen.getByLabelText('Context')).toBeInTheDocument();
    expect(screen.getByLabelText('Active workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Donna rail')).toBeInTheDocument();
    expect(screen.getByLabelText('Command Donna')).toBeInTheDocument();
  });

  it('turns a typed command into a draft objective', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Command Donna'), 'Launch the new site{Enter}');
    expect(await screen.findByText('Launch the new site')).toBeInTheDocument();
  });

  it('switches the active context section', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Leads' }));
    expect(screen.getByRole('heading', { name: 'Leads' })).toBeInTheDocument();
  });
});
