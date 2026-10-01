import type { WorkItemOwner } from '@donna/core-domain';

/**
 * Donna's plan for an objective, as stored and served. Produced by validating
 * the model's structured output against the caller's workspace — never stored
 * raw — so every id it references was checked to exist in the tenant.
 */
export interface Plan {
  /** Donna's one-or-two-sentence read, in her voice. */
  readonly summary: string;
  readonly client: PlanClient;
  readonly project: PlanProject;
  readonly sprint: PlanSprint | null;
  readonly tasks: readonly PlanTask[];
  /** Questions that would materially change the plan (may be empty). */
  readonly questions: readonly string[];
}

export type PlanClient =
  | { readonly kind: 'existing'; readonly id: string; readonly name: string }
  | { readonly kind: 'new'; readonly name: string }
  | { readonly kind: 'none' };

export type PlanProject =
  | { readonly kind: 'existing'; readonly id: string; readonly name: string }
  | { readonly kind: 'new'; readonly name: string };

export interface PlanSprint {
  readonly name: string;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
}

export interface PlanTask {
  readonly title: string;
  readonly subtasks: readonly string[];
  readonly owner: WorkItemOwner;
}

/** The workspace the model may place work into (names and ids it can reference). */
export interface PlanContext {
  readonly outcome: string;
  /** The user's local date, `YYYY-MM-DD`. */
  readonly today: string;
  readonly clients: readonly {
    readonly id: string;
    readonly name: string;
    readonly projects: readonly { readonly id: string; readonly name: string }[];
  }[];
  /** Projects with no client (internal work). */
  readonly internalProjects: readonly { readonly id: string; readonly name: string }[];
}

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };

/**
 * JSON Schema for the model's structured output (constrained decoding). Only
 * features structured outputs support: no length/number constraints — limits
 * are enforced in {@link parsePlan} instead.
 */
export const PLAN_RESPONSE_SCHEMA: Readonly<Record<string, unknown>> = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'client', 'project', 'sprint', 'tasks', 'questions'],
  properties: {
    summary: { type: 'string' },
    client: {
      type: 'object',
      additionalProperties: false,
      required: ['existingClientId', 'newClientName'],
      properties: { existingClientId: nullableString, newClientName: nullableString },
    },
    project: {
      type: 'object',
      additionalProperties: false,
      required: ['existingProjectId', 'newProjectName'],
      properties: { existingProjectId: nullableString, newProjectName: nullableString },
    },
    sprint: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'startsOn', 'endsOn'],
          properties: {
            name: { type: 'string' },
            startsOn: nullableString,
            endsOn: nullableString,
          },
        },
      ],
    },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'subtasks', 'donnaCanDo'],
        properties: {
          title: { type: 'string' },
          subtasks: { type: 'array', items: { type: 'string' } },
          donnaCanDo: { type: 'boolean' },
        },
      },
    },
    questions: { type: 'array', items: { type: 'string' } },
  },
};

/** The model's output could not be turned into a usable plan. */
export class PlanFormatError extends Error {
  constructor(readonly code: 'invalid_plan' | 'empty_plan') {
    super(code);
    this.name = 'PlanFormatError';
  }
}

const MAX_TASKS = 12;
const MAX_SUBTASKS = 8;
const MAX_QUESTIONS = 3;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  // Collapse whitespace (titles are one line) and cap the length.
  const t = value.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function realDate(value: unknown): string | null {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Validate and normalize the model's JSON into a {@link Plan}. Ids the model
 * returns are trusted only if they appear in `context`; an unknown id is
 * dropped (never followed). An existing project wins over the client choice,
 * so the plan can't put a project under the wrong client.
 */
export function parsePlan(raw: string, context: PlanContext): Plan {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new PlanFormatError('invalid_plan');
  }
  const o = record(json);
  if (Object.keys(o).length === 0) throw new PlanFormatError('invalid_plan');

  const clientsById = new Map(context.clients.map((c) => [c.id, c]));
  const projectsById = new Map(
    [
      ...context.clients.flatMap((c) =>
        c.projects.map((p) => ({ ...p, clientId: c.id as string | null })),
      ),
      ...context.internalProjects.map((p) => ({ ...p, clientId: null as string | null })),
    ].map((p) => [p.id, p]),
  );

  const c = record(o['client']);
  const p = record(o['project']);
  let client: PlanClient = { kind: 'none' };
  const existingClient = clientsById.get(String(c['existingClientId'] ?? ''));
  if (existingClient !== undefined) {
    client = { kind: 'existing', id: existingClient.id, name: existingClient.name };
  } else if (text(c['newClientName'], 120) !== '') {
    const name = text(c['newClientName'], 120);
    // Re-use an existing client with the same name rather than duplicating it.
    const same = context.clients.find((x) => x.name.toLowerCase() === name.toLowerCase());
    client = same ? { kind: 'existing', id: same.id, name: same.name } : { kind: 'new', name };
  }

  let project: PlanProject;
  const existingProject = projectsById.get(String(p['existingProjectId'] ?? ''));
  if (existingProject !== undefined) {
    project = { kind: 'existing', id: existingProject.id, name: existingProject.name };
    const owner =
      existingProject.clientId === null ? null : clientsById.get(existingProject.clientId);
    client = owner ? { kind: 'existing', id: owner.id, name: owner.name } : { kind: 'none' };
  } else {
    const name = text(p['newProjectName'], 120) || text(context.outcome, 60) || 'New project';
    project = { kind: 'new', name };
  }

  let sprint: PlanSprint | null = null;
  const s = o['sprint'];
  if (s !== null && typeof s === 'object') {
    const so = record(s);
    const name = text(so['name'], 120);
    if (name !== '') {
      let startsOn = realDate(so['startsOn']);
      let endsOn = realDate(so['endsOn']);
      if (startsOn !== null && endsOn !== null && endsOn < startsOn) {
        startsOn = null;
        endsOn = null;
      }
      sprint = { name, startsOn, endsOn };
    }
  }

  const tasks: PlanTask[] = (Array.isArray(o['tasks']) ? o['tasks'] : [])
    .map((t) => record(t))
    .map((t) => ({
      title: text(t['title'], 200),
      subtasks: (Array.isArray(t['subtasks']) ? t['subtasks'] : [])
        .map((x) => text(x, 200))
        .filter((x) => x !== '')
        .slice(0, MAX_SUBTASKS),
      owner: (t['donnaCanDo'] === true ? 'donna' : 'you') as WorkItemOwner,
    }))
    .filter((t) => t.title !== '')
    .slice(0, MAX_TASKS);
  if (tasks.length === 0) throw new PlanFormatError('empty_plan');

  const questions = (Array.isArray(o['questions']) ? o['questions'] : [])
    .map((q) => text(q, 240))
    .filter((q) => q !== '')
    .slice(0, MAX_QUESTIONS);

  return {
    summary: text(o['summary'], 400) || 'Here’s how I’d set this up.',
    client,
    project,
    sprint,
    tasks,
    questions,
  };
}
