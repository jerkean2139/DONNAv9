import {
  AutomationsIcon,
  LeadsIcon,
  MemoryIcon,
  PeopleIcon,
  ProjectsIcon,
  TasksIcon,
  TodayIcon,
} from '../components/icons';
import type { NavSection } from '../types';

// The app's sections. Only Today is backed by the API so far; the others show
// an honest "not connected yet" state instead of fabricated data.
export const SECTIONS: NavSection[] = [
  { key: 'today', label: 'Today', icon: TodayIcon, live: true },
  {
    key: 'projects',
    label: 'Projects',
    icon: ProjectsIcon,
    blurb: 'Group objectives into projects and see how each one is tracking.',
  },
  {
    key: 'tasks',
    label: 'Tasks',
    icon: TasksIcon,
    blurb: 'The work Donna and your team are doing to deliver your objectives.',
  },
  {
    key: 'leads',
    label: 'Leads',
    icon: LeadsIcon,
    blurb: 'Your pipeline from GoHighLevel, with Donna’s suggested follow-ups.',
  },
  {
    key: 'people',
    label: 'People',
    icon: PeopleIcon,
    blurb: 'Clients, partners and your team — everyone Donna works with.',
  },
  {
    key: 'memory',
    label: 'Memory & Knowledge',
    icon: MemoryIcon,
    blurb: 'What Donna knows about your business, and where she learned it.',
  },
  {
    key: 'automations',
    label: 'Automations',
    icon: AutomationsIcon,
    blurb: 'Recurring work Donna runs for you on a schedule.',
  },
];

/** Sections that get their own tab on phones; the rest live under "More". */
export const PRIMARY_TABS = ['today', 'projects', 'tasks', 'leads'];
