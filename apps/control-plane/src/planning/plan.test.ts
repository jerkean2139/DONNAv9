import { describe, expect, it } from 'vitest';

import { PlanFormatError, parsePlan, type PlanContext } from './plan.js';

const context: PlanContext = {
  outcome: 'Get the Acme website relaunch ready by the 16th',
  today: '2026-10-01',
  clients: [
    { id: 'c-acme', name: 'Acme Co', projects: [{ id: 'p-web', name: 'Website' }] },
    { id: 'c-blue', name: 'Bluebird Dental', projects: [] },
  ],
  internalProjects: [{ id: 'p-ops', name: 'Ops' }],
};

const base = {
  summary: 'I’ll set up the relaunch as a sprint.',
  client: { existingClientId: 'c-acme', newClientName: null },
  project: { existingProjectId: null, newProjectName: 'Website relaunch' },
  sprint: { name: 'Launch sprint', startsOn: '2026-10-05', endsOn: '2026-10-16' },
  tasks: [{ title: 'Write launch checklist', subtasks: ['DNS', 'Analytics'], donnaCanDo: true }],
  questions: [],
};

const parse = (o: unknown) => parsePlan(JSON.stringify(o), context);

describe('parsePlan', () => {
  it('normalizes a well-formed plan', () => {
    const plan = parse(base);
    expect(plan.client).toEqual({ kind: 'existing', id: 'c-acme', name: 'Acme Co' });
    expect(plan.project).toEqual({ kind: 'new', name: 'Website relaunch' });
    expect(plan.sprint).toEqual({
      name: 'Launch sprint',
      startsOn: '2026-10-05',
      endsOn: '2026-10-16',
    });
    expect(plan.tasks).toEqual([
      { title: 'Write launch checklist', subtasks: ['DNS', 'Analytics'], owner: 'donna' },
    ]);
  });

  it('never follows ids that are not in the workspace', () => {
    const plan = parse({
      ...base,
      client: { existingClientId: 'c-someone-elses', newClientName: null },
      project: { existingProjectId: 'p-other-tenant', newProjectName: null },
    });
    expect(plan.client).toEqual({ kind: 'none' });
    expect(plan.project.kind).toBe('new');
  });

  it('puts an existing project under its own client', () => {
    const plan = parse({
      ...base,
      client: { existingClientId: 'c-blue', newClientName: null },
      project: { existingProjectId: 'p-web', newProjectName: null },
    });
    expect(plan.project).toEqual({ kind: 'existing', id: 'p-web', name: 'Website' });
    expect(plan.client).toEqual({ kind: 'existing', id: 'c-acme', name: 'Acme Co' });
    // An internal project has no client.
    expect(
      parse({ ...base, project: { existingProjectId: 'p-ops', newProjectName: null } }).client,
    ).toEqual({
      kind: 'none',
    });
  });

  it('reuses an existing client instead of creating a same-named one', () => {
    const plan = parse({
      ...base,
      client: { existingClientId: null, newClientName: '  acme co ' },
    });
    expect(plan.client).toEqual({ kind: 'existing', id: 'c-acme', name: 'Acme Co' });
    expect(
      parse({ ...base, client: { existingClientId: null, newClientName: 'Northwind' } }).client,
    ).toEqual({
      kind: 'new',
      name: 'Northwind',
    });
  });

  it('drops impossible or inverted sprint dates', () => {
    expect(
      parse({ ...base, sprint: { name: 'S', startsOn: '2026-02-30', endsOn: null } }).sprint,
    ).toEqual({
      name: 'S',
      startsOn: null,
      endsOn: null,
    });
    expect(
      parse({ ...base, sprint: { name: 'S', startsOn: '2026-10-16', endsOn: '2026-10-05' } })
        .sprint,
    ).toEqual({
      name: 'S',
      startsOn: null,
      endsOn: null,
    });
    expect(parse({ ...base, sprint: null }).sprint).toBeNull();
  });

  it('caps sizes and cleans text', () => {
    const plan = parse({
      ...base,
      tasks: Array.from({ length: 20 }, (_v, i) => ({
        title: `  Task\n ${i}  `,
        subtasks: Array.from({ length: 12 }, (_w, j) => `sub ${j}`),
        donnaCanDo: false,
      })),
      questions: ['a?', 'b?', 'c?', 'd?'],
    });
    expect(plan.tasks).toHaveLength(12);
    expect(plan.tasks[0]).toEqual(expect.objectContaining({ title: 'Task 0', owner: 'you' }));
    expect(plan.tasks[0]!.subtasks).toHaveLength(8);
    expect(plan.questions).toHaveLength(3);
    expect(parse({ ...base, summary: 'x'.repeat(1000) }).summary.length).toBeLessThanOrEqual(400);
  });

  it('rejects unusable output', () => {
    expect(() => parsePlan('not json', context)).toThrow(PlanFormatError);
    expect(() =>
      parse({ ...base, tasks: [{ title: '  ', subtasks: [], donnaCanDo: false }] }),
    ).toThrowError('empty_plan');
  });
});
