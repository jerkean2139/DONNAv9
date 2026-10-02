// A SAMPLE agent run for the agent room, shown clearly labeled as a sample.
// Specialist agents aren't live yet (Agent Factory, master plan Phase 6); this
// lets us design and fine-tune the view, and the agent roster, before they
// are. The shapes match what the real run will stream, so swapping the source
// later changes no UI. Nothing here is a real result.

export type AgentStatus = 'standing_by' | 'working' | 'waiting' | 'done';

export interface AgentProfile {
  /** Short handle used for @tags. */
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly goal: string;
  readonly duties: readonly string[];
  readonly allowedTools: readonly string[];
  readonly model: string;
  /** Spend ceiling for this run, in US dollars. */
  readonly budgetUsd: number;
  readonly status: AgentStatus;
  /** Donna is the orchestrator; the rest are spun up per task. */
  readonly orchestrator?: boolean;
}

export type AgentMessageKind = 'spawn' | 'message' | 'handoff' | 'check' | 'done';

export interface AgentMessage {
  readonly id: string;
  readonly from: string;
  readonly kind: AgentMessageKind;
  readonly text: string;
  /** Seconds after the run started. */
  readonly at: number;
}

export interface AgentRun {
  readonly title: string;
  readonly agents: readonly AgentProfile[];
  readonly messages: readonly AgentMessage[];
}

export const SAMPLE_AGENT_RUN: AgentRun = {
  title: 'Launch the Summit Ridge Visibility Program',
  agents: [
    {
      id: 'donna',
      name: 'Donna',
      role: 'Chief of staff (orchestrator)',
      goal: 'Turn the outcome into finished, checked work and keep you in the loop.',
      duties: [
        'Break the outcome into tasks',
        'Spin up the right specialist for each task',
        'Route handoffs and resolve blockers',
        'Ask you before anything client-facing goes out',
      ],
      allowedTools: ['Plan', 'Spin up agents', 'Read the work hierarchy'],
      model: 'claude-opus-5-5',
      budgetUsd: 5,
      status: 'working',
      orchestrator: true,
    },
    {
      id: 'scout',
      name: 'Scout',
      role: 'Discovery analyst',
      goal: 'Know the client, the market and the competitors before anything gets built.',
      duties: ['Audit the current site and listings', 'Scan the top 3 competitors'],
      allowedTools: ['Web research (read only)', 'Client files'],
      model: 'claude-sonnet-5-5',
      budgetUsd: 1.5,
      status: 'done',
    },
    {
      id: 'quill',
      name: 'Quill',
      role: 'Copywriter',
      goal: 'Write page and lead magnet copy in the client brand voice.',
      duties: ['Homepage and service page copy', 'Roof Replacement Cost Guide draft'],
      allowedTools: ['Brand voice guide', 'Drafts (no publishing)'],
      model: 'claude-sonnet-5-5',
      budgetUsd: 2,
      status: 'working',
    },
    {
      id: 'forge',
      name: 'Forge',
      role: 'Web builder',
      goal: 'Ship a fast, mobile-first site that turns visitors into booked inspections.',
      duties: ['Page structure and layout', 'SEO basics and local schema', 'Roof cost calculator'],
      allowedTools: ['Zenoflo site builder (staging only)', 'Code sandbox'],
      model: 'claude-sonnet-5-5',
      budgetUsd: 3,
      status: 'waiting',
    },
    {
      id: 'flow',
      name: 'Flow',
      role: 'Zenoflo architect',
      goal: 'Every lead lands in the right pipeline stage and gets followed up fast.',
      duties: ['Pipeline and stages', 'Custom fields and tags', 'Speed-to-lead nurture'],
      allowedTools: ['Zenoflo sub-account (sandbox)', 'Snapshot library'],
      model: 'claude-sonnet-5-5',
      budgetUsd: 2.5,
      status: 'standing_by',
    },
    {
      id: 'sentinel',
      name: 'Sentinel',
      role: 'QA checker',
      goal: 'Nothing ships until it is tested end to end against the definition of done.',
      duties: ['Test every form and handoff', 'Check copy against the brand guide'],
      allowedTools: ['Read only access to everything', 'Test submissions'],
      model: 'claude-haiku-4-5',
      budgetUsd: 1,
      status: 'standing_by',
    },
  ],
  messages: [
    {
      id: 'm1',
      from: 'donna',
      kind: 'message',
      at: 0,
      text: 'Outcome: launch the Summit Ridge Visibility Program, Best tier. Breaking it into four sprints. Starting with discovery.',
    },
    {
      id: 'm2',
      from: 'donna',
      kind: 'spawn',
      at: 2,
      text: 'Spun up @scout to audit the current site, listings and competitors.',
    },
    {
      id: 'm3',
      from: 'scout',
      kind: 'message',
      at: 41,
      text: 'Audit done. Site is not mobile friendly, no booking path, 4.2 stars on 37 reviews. Top competitor wins on "roof replacement cost" searches. @donna that looks like our lead magnet angle.',
    },
    {
      id: 'm4',
      from: 'donna',
      kind: 'spawn',
      at: 44,
      text: 'Spun up @quill for page copy and @forge for the site build.',
    },
    {
      id: 'm5',
      from: 'donna',
      kind: 'handoff',
      at: 45,
      text: "@quill use Scout's audit and the brand voice guide. Lead with fast, honest inspections. @forge wait for the homepage copy before layout.",
    },
    {
      id: 'm6',
      from: 'quill',
      kind: 'message',
      at: 96,
      text: 'Homepage draft ready: hero, three services, trust strip, booking CTA. @forge handing it to you. @donna one question for Jeremy: do we show price ranges on the site?',
    },
    {
      id: 'm7',
      from: 'donna',
      kind: 'message',
      at: 98,
      text: 'Flagging for you, Jeremy: show price ranges publicly, or keep them in the cost guide only? Holding that section until you decide.',
    },
    {
      id: 'm8',
      from: 'forge',
      kind: 'message',
      at: 140,
      text: 'Layout built on staging. Mobile pass done. @sentinel ready for a check on the booking form.',
    },
    {
      id: 'm9',
      from: 'donna',
      kind: 'spawn',
      at: 141,
      text: 'Spun up @sentinel to test the booking path end to end.',
    },
    {
      id: 'm10',
      from: 'sentinel',
      kind: 'check',
      at: 170,
      text: 'Booking form submits, but no contact lands in Zenoflo yet. Not passing. @flow this needs the pipeline first.',
    },
    {
      id: 'm11',
      from: 'donna',
      kind: 'spawn',
      at: 172,
      text: 'Spun up @flow to build the pipeline, fields and speed-to-lead nurture.',
    },
    {
      id: 'm12',
      from: 'flow',
      kind: 'message',
      at: 230,
      text: 'Pipeline live in the sandbox: new lead, inspection booked, quote sent, won or lost. Missed-call text back is on. @sentinel retest.',
    },
    {
      id: 'm13',
      from: 'sentinel',
      kind: 'check',
      at: 251,
      text: 'Retest passed. Form to contact to "inspection booked" stage to SMS in under 60 seconds.',
    },
    {
      id: 'm14',
      from: 'donna',
      kind: 'done',
      at: 254,
      text: 'Sprint 2 checks out, except the pricing question waiting on you. Next up: the cost guide and the calculator.',
    },
  ],
};
