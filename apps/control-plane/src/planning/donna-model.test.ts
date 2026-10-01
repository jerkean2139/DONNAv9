import type { ModelAdapter, ModelRequest, ModelResult } from '@donna/adapter-base';
import { describe, expect, it, vi } from 'vitest';

import { AdapterDonnaModel, DonnaModelError } from './donna-model.js';
import { PLAN_RESPONSE_SCHEMA, type PlanContext } from './plan.js';

function adapterReturning(result: Partial<ModelResult>) {
  const execute = vi.fn<(req: ModelRequest) => Promise<ModelResult>>(async () => ({
    text: '',
    finishReason: 'end_turn',
    usage: { inputTokens: 10, outputTokens: 10, costUsd: 0.0123, latencyMs: 5 },
    ...result,
  }));
  return { adapter: { execute } as unknown as ModelAdapter, execute };
}

const context: PlanContext = {
  outcome: 'Prep the <board> update',
  today: '2026-10-01',
  clients: [{ id: 'c1', name: 'Acme', projects: [] }],
  internalProjects: [],
};

const planJson = JSON.stringify({
  summary: 'On it.',
  client: { existingClientId: null, newClientName: null },
  project: { existingProjectId: null, newProjectName: 'Board update' },
  sprint: null,
  tasks: [{ title: 'Outline the update', subtasks: [], donnaCanDo: true }],
  questions: [],
});

describe('AdapterDonnaModel.plan', () => {
  it('asks for schema-constrained JSON with the workspace as data', async () => {
    const { adapter, execute } = adapterReturning({ text: planJson });
    const out = await new AdapterDonnaModel(adapter, 'claude-opus-5-5').plan(context);
    expect(out).toMatchObject({ model: 'claude-opus-5-5', costUsd: 0.0123 });
    expect(out.plan.project).toEqual({ kind: 'new', name: 'Board update' });

    const req = execute.mock.calls[0]![0];
    expect(req.responseSchema).toBe(PLAN_RESPONSE_SCHEMA);
    expect(req.messages[0]!.role).toBe('system');
    const user = req.messages[1]!.content;
    expect(user).toContain('<today>2026-10-01 (Thursday)</today>');
    expect(user).toContain('"name":"Acme"');
    // The user's text is escaped so it can't close or open tags.
    expect(user).toContain('<outcome>Prep the &lt;board&gt; update</outcome>');
  });

  it('maps refusals, truncation and junk to stable codes', async () => {
    const run = (r: Partial<ModelResult>) =>
      new AdapterDonnaModel(adapterReturning(r).adapter, 'm').plan(context);
    await expect(run({ finishReason: 'refusal' })).rejects.toMatchObject({ code: 'declined' });
    await expect(run({ finishReason: 'max_tokens', text: '{' })).rejects.toMatchObject({
      code: 'too_long',
    });
    await expect(run({ text: 'nope' })).rejects.toBeInstanceOf(DonnaModelError);
  });
});

describe('AdapterDonnaModel.draft', () => {
  it('writes the deliverable from the task, its subtasks and context', async () => {
    const { adapter, execute } = adapterReturning({ text: '  # Board update\n\nHello  ' });
    const out = await new AdapterDonnaModel(adapter, 'm').draft({
      task: 'Outline the update',
      subtasks: ['Revenue', 'Hiring'],
      project: 'Board update',
      client: null,
      objective: 'Prep the board update',
    });
    expect(out.markdown).toBe('# Board update\n\nHello');
    const req = execute.mock.calls[0]![0];
    expect(req.responseSchema).toBeUndefined();
    expect(req.messages[1]!.content).toContain('<subtasks>\n- Revenue\n- Hiring\n</subtasks>');
    expect(req.messages[1]!.content).not.toContain('<client>');
  });

  it('rejects empty or declined drafts', async () => {
    const draft = (r: Partial<ModelResult>) =>
      new AdapterDonnaModel(adapterReturning(r).adapter, 'm').draft({
        task: 't',
        subtasks: [],
        project: 'p',
        client: null,
        objective: null,
      });
    await expect(draft({ text: '   ' })).rejects.toMatchObject({ code: 'empty_draft' });
    await expect(draft({ finishReason: 'refusal' })).rejects.toMatchObject({ code: 'declined' });
  });
});
