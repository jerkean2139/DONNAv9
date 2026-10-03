import type { WorkItemOwner, WorkItemStatus } from '@donna/core-domain';

// A fictional demo client for showing DONNA end to end: three projects (the
// Visibility Program, a Manumation Playbook and Zenoflo Hosting Plus), each
// with sprints, tasks and subtasks. Owners by role go in the task titles,
// since tasks are owned by "you" (the team) or Donna. Nothing here is real
// client data.

/** Every demo client's notes start with this, so removal touches only demo rows. */
export const DEMO_MARKER = 'Demo client: fictional data for demos.';

export interface DemoTask {
  readonly title: string;
  readonly status?: WorkItemStatus;
  readonly owner?: WorkItemOwner;
  readonly subtasks?: readonly (
    string | { readonly title: string; readonly status: WorkItemStatus }
  )[];
}

export interface DemoSprint {
  readonly name: string;
  /** Start offset in days from today; each sprint runs 14 days. */
  readonly startOffsetDays: number;
  readonly tasks: readonly DemoTask[];
}

export interface DemoProject {
  readonly name: string;
  readonly sprints: readonly DemoSprint[];
  /** Tasks not yet in a sprint. */
  readonly backlog?: readonly DemoTask[];
}

export interface DemoClient {
  readonly name: string;
  readonly notes: string;
  readonly projects: readonly DemoProject[];
}

export const DEMO_CLIENT: DemoClient = {
  name: 'Summit Ridge Roofing (Demo)',
  notes: `${DEMO_MARKER} Family-owned roofing company, residential and light commercial. Remove it anytime from More, Demo data.`,
  projects: [
    {
      name: 'Visibility Program (Best)',
      sprints: [
        {
          name: 'Sprint 1: Discovery and brand',
          startOffsetDays: -21,
          tasks: [
            {
              title: 'Kickoff call and goals intake (Jeremy)',
              status: 'done',
              subtasks: [
                { title: 'Confirm core offer and service area', status: 'done' },
                { title: 'Collect brand assets and logins', status: 'done' },
              ],
            },
            {
              title: 'Visibility audit: site, listings, reviews (Miryam)',
              status: 'done',
              subtasks: [
                { title: 'Google Business Profile review', status: 'done' },
                { title: 'Competitor scan, top 3', status: 'done' },
              ],
            },
            { title: 'Brand voice and messaging guide (Kianna)', status: 'done' },
          ],
        },
        {
          name: 'Sprint 2: Website rebuild',
          startOffsetDays: -7,
          tasks: [
            { title: 'Sitemap and page wireframes (Taha)', status: 'done' },
            {
              title: 'Homepage and service page copy (Donna drafts, Miryam reviews)',
              status: 'in_progress',
              owner: 'donna',
            },
            {
              title: 'Build the site in Zenoflo (Taha)',
              status: 'in_progress',
              subtasks: [
                { title: 'Mobile responsive pass', status: 'done' },
                'SEO basics: titles, meta descriptions, local schema',
                'Page speed check',
              ],
            },
            { title: 'Client review and revision round (Jason)' },
          ],
        },
        {
          name: 'Sprint 3: Full Zenoflo build-out',
          startOffsetDays: 7,
          tasks: [
            {
              title: 'Pipeline and stages (Jaweria)',
              subtasks: ['New lead, inspection booked, quote sent, won or lost'],
            },
            { title: 'Custom fields and tags (Jaweria)' },
            { title: 'Calendar and inspection booking (Jaweria)' },
            {
              title: 'Speed-to-lead nurture: SMS and email (Jaweria)',
              subtasks: ['Missed-call text back', '7-day nurture sequence'],
            },
            { title: 'Review request automation (Gaven)' },
          ],
        },
        {
          name: 'Sprint 4: Lead magnet, CTA and launch',
          startOffsetDays: 21,
          tasks: [
            { title: 'Lead magnet: Roof Replacement Cost Guide (Donna drafts)', owner: 'donna' },
            {
              title: 'Interactive roof cost calculator (Taha)',
              subtasks: [
                'Inputs: roof size, material, pitch',
                'Result sends contact and tag into Zenoflo',
              ],
            },
            { title: 'CTA connection: forms to pipeline to nurture (Gaven)' },
            {
              title: 'QA and launch checklist (Taha)',
              subtasks: ['Test every form end to end', 'Analytics and conversion tracking'],
            },
            { title: 'Launch announcement and handoff (Kianna)' },
          ],
        },
      ],
      backlog: [{ title: 'Monthly visibility report template (Kianna)' }],
    },
    {
      name: 'Manumation Playbook',
      sprints: [
        {
          name: 'Sprint 1: Assessment',
          startOffsetDays: -14,
          tasks: [
            { title: 'Five-pillar assessment session (Jeremy)', status: 'done' },
            { title: 'Current State pass (Jeremy)', status: 'done' },
          ],
        },
        {
          name: 'Sprint 2: Ideal State and Negotiated Reality',
          startOffsetDays: 0,
          tasks: [
            { title: 'Ideal State workshop (Jeremy)', status: 'in_progress' },
            { title: 'Negotiated Reality pass (Jeremy)' },
            {
              title: 'Blueprint: visual map of the whole business (Donna drafts)',
              owner: 'donna',
            },
          ],
        },
        {
          name: 'Sprint 3: Playbook delivery',
          startOffsetDays: 14,
          tasks: [
            {
              title: 'Pillar recommendations (Jeremy)',
              subtasks: [
                'Lead Generation',
                'Lead Nurture',
                'Sales and Conversion',
                'Operations and Fulfillment',
                'Brand Advocacy',
              ],
            },
            { title: 'Doors recommendation: DIY, DWY, DFY, Certified Placement, Custom' },
            { title: 'Playbook delivery call (Jeremy)' },
          ],
        },
      ],
    },
    {
      name: 'Zenoflo Hosting Plus',
      sprints: [
        {
          name: 'Sprint 1: Setup',
          startOffsetDays: -3,
          tasks: [
            {
              title: 'Domain and email deliverability (Taha)',
              status: 'in_progress',
              subtasks: [{ title: 'DNS records', status: 'done' }, 'SPF, DKIM and DMARC'],
            },
            { title: 'Sub-account setup from snapshot (Jaweria)', status: 'done' },
            { title: 'Invite the client team (Jason)' },
          ],
        },
        {
          name: 'Sprint 2: Ongoing care',
          startOffsetDays: 11,
          tasks: [
            { title: 'Monthly updates and backups (Taha)' },
            { title: 'Uptime monitoring (Gaven)' },
            { title: 'Quarterly review call (Jason)' },
          ],
        },
      ],
    },
  ],
};
