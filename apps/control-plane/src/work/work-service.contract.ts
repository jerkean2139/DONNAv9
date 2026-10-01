import { describe, expect, it } from 'vitest';

import { WorkValidationError, type WorkService } from './types.js';

export interface ContractFixture {
  readonly work: WorkService;
  /** Two organizations, each with one user, already provisioned. */
  readonly org: string;
  readonly userId: string;
  readonly otherOrg: string;
  /** Create an objective in `org` and return its id (for objective links). */
  readonly makeObjective: () => Promise<string>;
}

async function rejects(p: Promise<unknown>, code: string): Promise<void> {
  await expect(p).rejects.toSatisfy(
    (e: unknown) => e instanceof WorkValidationError && e.code === code,
  );
}

/**
 * Behavior every {@link WorkService} must share. Run against the in-memory
 * service in unit CI and against Postgres in the integration job, so the two
 * can never drift.
 */
export function describeWorkServiceContract(
  name: string,
  setup: () => Promise<ContractFixture>,
  enabled = true,
): void {
  describe.skipIf(!enabled)(`WorkService contract: ${name}`, () => {
    async function tree(f: ContractFixture) {
      const client = await f.work.createClient(f.org, { name: 'Acme Co' });
      const project = await f.work.createProject(f.org, { name: 'Website', clientId: client.id });
      const sprint = await f.work.createSprint(f.org, {
        projectId: project.id,
        name: 'Sprint 1',
        startsOn: '2026-10-01',
        endsOn: '2026-10-14',
      });
      const task = await f.work.createWorkItem(
        f.org,
        { projectId: project.id, title: 'Design homepage', sprintId: sprint.id },
        f.userId,
      );
      return { client, project, sprint, task };
    }

    it('builds client → project → sprint → task → subtask', async () => {
      const f = await setup();
      const { client, project, sprint, task } = await tree(f);
      const sub = await f.work.createWorkItem(
        f.org,
        { projectId: project.id, title: 'Hero copy', parentId: task.id },
        f.userId,
      );
      expect(sub.parentId).toBe(task.id);
      expect(sub.sprintId).toBe(sprint.id); // subtasks live in their parent's sprint
      expect((await f.work.getClient(f.org, client.id))?.projectCount).toBe(1);
      expect((await f.work.listProjects(f.org, { clientId: client.id })).map((p) => p.id)).toEqual([
        project.id,
      ]);
      const items = await f.work.listWorkItems(f.org, { projectId: project.id });
      expect(items.map((i) => i.title).sort()).toEqual(['Design homepage', 'Hero copy']);
    });

    it('appends tasks in order', async () => {
      const f = await setup();
      const { project, task } = await tree(f);
      const second = await f.work.createWorkItem(
        f.org,
        { projectId: project.id, title: 'Second' },
        f.userId,
      );
      expect(second.position).toBe(task.position + 1);
    });

    it('enforces the hierarchy rules', async () => {
      const f = await setup();
      const { project, task } = await tree(f);
      const other = await f.work.createProject(f.org, { name: 'Other', clientId: null });
      const otherSprint = await f.work.createSprint(f.org, { projectId: other.id, name: 'S' });
      const sub = await f.work.createWorkItem(
        f.org,
        { projectId: project.id, title: 'Sub', parentId: task.id },
        f.userId,
      );
      await rejects(
        f.work.createWorkItem(
          f.org,
          { projectId: project.id, title: 'x', parentId: sub.id },
          f.userId,
        ),
        'subtasks_are_one_level',
      );
      await rejects(
        f.work.createWorkItem(
          f.org,
          { projectId: project.id, title: 'x', sprintId: otherSprint.id },
          f.userId,
        ),
        'sprint_not_found',
      );
      await rejects(
        f.work.createWorkItem(
          f.org,
          { projectId: other.id, title: 'x', parentId: task.id },
          f.userId,
        ),
        'parent_not_found',
      );
      await rejects(
        f.work.updateWorkItem(f.org, sub.id, { sprintId: null }),
        'subtask_follows_parent',
      );
      await rejects(
        f.work.createSprint(f.org, {
          projectId: project.id,
          name: 'Bad',
          startsOn: '2026-10-10',
          endsOn: '2026-10-01',
        }),
        'ends_before_starts',
      );
      await rejects(
        f.work.createSprint(f.org, { projectId: project.id, name: 'Bad', startsOn: '2026-02-30' }),
        'invalid_date',
      );
      await rejects(f.work.createClient(f.org, { name: '   ' }), 'name_required');
    });

    it('moves subtasks with their task between sprints', async () => {
      const f = await setup();
      const { project, task } = await tree(f);
      const sub = await f.work.createWorkItem(
        f.org,
        { projectId: project.id, title: 'Sub', parentId: task.id },
        f.userId,
      );
      const sprint2 = await f.work.createSprint(f.org, { projectId: project.id, name: 'Sprint 2' });
      await f.work.updateWorkItem(f.org, task.id, { sprintId: sprint2.id });
      expect((await f.work.getWorkItem(f.org, sub.id))?.sprintId).toBe(sprint2.id);
      await f.work.updateWorkItem(f.org, task.id, { sprintId: null });
      expect((await f.work.getWorkItem(f.org, sub.id))?.sprintId).toBeNull();
    });

    it('filters open tasks and updates status', async () => {
      const f = await setup();
      const { task } = await tree(f);
      await f.work.updateWorkItem(f.org, task.id, { status: 'done' });
      expect(await f.work.listWorkItems(f.org, { open: true })).toEqual([]);
      expect((await f.work.listWorkItems(f.org, {})).map((t) => t.status)).toEqual(['done']);
    });

    it('attaches links with a detected provider, and files with their bytes', async () => {
      const f = await setup();
      const { client, project, sprint, task } = await tree(f);
      const drive = await f.work.createLink(
        f.org,
        { type: 'client', id: client.id },
        { url: 'https://drive.google.com/drive/folders/abc' },
        f.userId,
      );
      expect(drive).toMatchObject({
        kind: 'link',
        provider: 'google_drive',
        target: { type: 'client' },
      });
      expect(drive.title).toBe('drive.google.com/drive/folders/abc');
      await f.work.createLink(
        f.org,
        { type: 'sprint', id: sprint.id },
        { url: 'https://www.figma.com/file/x', title: 'Mockups' },
        f.userId,
      );
      await rejects(
        f.work.createLink(
          f.org,
          { type: 'project', id: project.id },
          { url: 'javascript:alert(1)' },
          f.userId,
        ),
        'invalid_url',
      );
      const file = await f.work.createFile(
        f.org,
        { type: 'task', id: task.id },
        {
          filename: '../../brief.pdf',
          contentType: 'application/pdf',
          content: Buffer.from('%PDF-1'),
        },
        f.userId,
      );
      expect(file).toMatchObject({ kind: 'file', title: 'brief.pdf', sizeBytes: 6, url: null });
      const content = await f.work.getAttachmentContent(f.org, file.id);
      expect(content?.content.toString()).toBe('%PDF-1');
      expect(content?.contentType).toBe('application/pdf');
      expect(
        (await f.work.listAttachments(f.org, { type: 'sprint', id: sprint.id }))[0]?.title,
      ).toBe('Mockups');
    });

    it('deleting a task removes its subtasks and attachments', async () => {
      const f = await setup();
      const { project, task } = await tree(f);
      const sub = await f.work.createWorkItem(
        f.org,
        { projectId: project.id, title: 'Sub', parentId: task.id },
        f.userId,
      );
      const link = await f.work.createLink(
        f.org,
        { type: 'task', id: sub.id },
        { url: 'https://example.com' },
        f.userId,
      );
      expect(await f.work.deleteWorkItem(f.org, task.id)).toBe(true);
      expect(await f.work.getWorkItem(f.org, sub.id)).toBeNull();
      expect(await f.work.getAttachment(f.org, link.id)).toBeNull();
    });

    it('never crosses the tenant boundary', async () => {
      const f = await setup();
      const { client, project, task } = await tree(f);
      expect(await f.work.getClient(f.otherOrg, client.id)).toBeNull();
      expect(await f.work.getProject(f.otherOrg, project.id)).toBeNull();
      expect(await f.work.getWorkItem(f.otherOrg, task.id)).toBeNull();
      expect(await f.work.listClients(f.otherOrg)).toEqual([]);
      await rejects(
        f.work.createProject(f.otherOrg, { name: 'Steal', clientId: client.id }),
        'client_not_found',
      );
      await rejects(
        f.work.createLink(
          f.otherOrg,
          { type: 'task', id: task.id },
          { url: 'https://x.io' },
          f.userId,
        ),
        'target_not_found',
      );
      expect(await f.work.deleteWorkItem(f.otherOrg, task.id)).toBe(false);
      expect(await f.work.getWorkItem(f.org, task.id)).not.toBeNull();
    });

    it('tracks Donna-owned tasks, their drafts, and objective progress', async () => {
      const f = await setup();
      const { project } = await tree(f);
      const objectiveId = await f.makeObjective();
      const mine = await f.work.createWorkItem(
        f.org,
        { projectId: project.id, title: 'Draft the launch email', objectiveId, owner: 'donna' },
        f.userId,
      );
      expect(mine).toMatchObject({ owner: 'donna', objectiveId, draftStatus: 'none', draft: null });
      await f.work.createWorkItem(
        f.org,
        { projectId: project.id, title: 'Call Sam', objectiveId },
        f.userId,
      );

      expect((await f.work.setDraft(f.org, mine.id, { status: 'drafting' }))?.draftStatus).toBe(
        'drafting',
      );
      const ready = await f.work.setDraft(f.org, mine.id, {
        status: 'ready',
        draft: '# Subject\nHello',
      });
      expect(ready).toMatchObject({
        draftStatus: 'ready',
        draft: '# Subject\nHello',
        draftError: null,
      });
      const failed = await f.work.setDraft(f.org, mine.id, { status: 'failed', error: 'refused' });
      // A failed retry keeps the last good draft.
      expect(failed).toMatchObject({
        draftStatus: 'failed',
        draftError: 'refused',
        draft: '# Subject\nHello',
      });
      expect(await f.work.setDraft(f.otherOrg, mine.id, { status: 'drafting' })).toBeNull();

      await f.work.updateWorkItem(f.org, mine.id, { status: 'done' });
      expect(await f.work.progressByObjective(f.org, [objectiveId])).toEqual({
        [objectiveId]: { done: 1, total: 2 },
      });
      expect(await f.work.progressByObjective(f.otherOrg, [objectiveId])).toEqual({});
      expect(await f.work.progressByObjective(f.org, [])).toEqual({});
    });
  });
}
