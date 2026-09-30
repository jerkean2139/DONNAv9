import type { NavSection } from '../types';

// The app's sections. Only Today is backed by the API so far; the others show
// an honest "not connected yet" state instead of fabricated data.
export const SECTIONS: NavSection[] = [
  { key: 'today', label: 'Today', live: true },
  {
    key: 'projects',
    label: 'Projects',
    blurb: 'Your objectives, grouped into the bigger bets they serve.',
  },
  {
    key: 'tasks',
    label: 'Tasks',
    blurb: 'Everything I and the team are doing to get your objectives over the line.',
  },
  {
    key: 'leads',
    label: 'Leads',
    blurb: 'Your pipeline from GoHighLevel — and who I think you should call first.',
  },
  {
    key: 'people',
    label: 'People',
    blurb: 'Clients, partners and your team. I remember everyone so you don’t have to.',
  },
  {
    key: 'memory',
    label: 'Memory',
    blurb: 'What I know about your business, and exactly where I learned it.',
  },
  {
    key: 'automations',
    label: 'Automations',
    blurb: 'The recurring work I run for you while you sleep.',
  },
];

/** Sections that get their own tab on phones; the rest live under "More". */
export const PRIMARY_TABS = ['today', 'projects', 'tasks', 'leads'];
