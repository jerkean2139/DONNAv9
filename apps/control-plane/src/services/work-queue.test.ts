import { EXECUTE_WORK_ORDER_TASK, type WorkOrder } from '@donna/orchestrator';
import { describe, expect, it } from 'vitest';

import { GraphileWorkQueue, InMemoryWorkQueue, type JobAdder } from './work-queue.js';

interface Call {
  identifier: string;
  payload: unknown;
  spec: { jobKey?: string; maxAttempts?: number } | undefined;
}

function fakeJobs(): { adder: JobAdder; calls: Call[] } {
  const calls: Call[] = [];
  const adder: JobAdder = {
    addJob: (identifier, payload, spec) => {
      calls.push({ identifier, payload, spec });
      return Promise.resolve({ id: `job-${calls.length}` });
    },
  };
  return { adder, calls };
}

const order: WorkOrder = {
  organizationId: 'org1',
  taskId: 'task1',
  requiredCapabilities: ['reasoning'],
};

describe('GraphileWorkQueue', () => {
  it('enqueues under the shared task name and returns the job id', async () => {
    const { adder, calls } = fakeJobs();
    const queue = new GraphileWorkQueue(adder);

    const result = await queue.enqueue(order);

    expect(result.jobId).toBe('job-1');
    expect(calls[0]?.identifier).toBe(EXECUTE_WORK_ORDER_TASK);
    expect(calls[0]?.payload).toEqual(order);
  });

  it('uses the task id as the job key so re-dispatch is idempotent', async () => {
    const { adder, calls } = fakeJobs();
    await new GraphileWorkQueue(adder).enqueue(order);
    expect(calls[0]?.spec).toEqual({ jobKey: 'task1' });
  });

  it('omits the job key when the order has no task id', async () => {
    const { adder, calls } = fakeJobs();
    const { taskId: _drop, ...noTask } = order;
    void _drop;
    await new GraphileWorkQueue(adder).enqueue(noTask);
    expect(calls[0]?.spec).toEqual({});
  });
});

describe('InMemoryWorkQueue', () => {
  it('records enqueued orders and hands back sequential job ids', async () => {
    const queue = new InMemoryWorkQueue();
    const a = await queue.enqueue(order);
    const b = await queue.enqueue({ ...order, taskId: 'task2' });
    expect([a.jobId, b.jobId]).toEqual(['mem-1', 'mem-2']);
    expect(queue.enqueued).toHaveLength(2);
    expect(queue.enqueued[1]?.taskId).toBe('task2');
  });
});
