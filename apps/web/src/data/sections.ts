import type { NavSection } from '../types';

// The app's sections. Today and the client work hierarchy (Clients → Projects
// → Sprints → Tasks) are live; the others show an honest "not connected yet"
// state instead of fabricated data.
export const SECTIONS: NavSection[] = [
  { key: 'today', label: 'Today', live: true },
  { key: 'clients', label: 'Clients', live: true },
  { key: 'projects', label: 'Projects', live: true },
  { key: 'tasks', label: 'Tasks', live: true },
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
export const PRIMARY_TABS = ['today', 'clients', 'tasks', 'leads'];
