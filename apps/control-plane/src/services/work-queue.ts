import { EXECUTE_WORK_ORDER_TASK, type WorkOrder } from '@donna/orchestrator';
import { makeWorkerUtils } from 'graphile-worker';

/**
 * The producer side of the durable work queue. The control-plane API enqueues a
 * {@link WorkOrder} here; the worker's `execute-work-order` task consumes it and
 * runs it through the orchestrator. The job name is owned by `@donna/orchestrator`
 * ({@link EXECUTE_WORK_ORDER_TASK}) so producer and consumer share one contract.
 */
export interface WorkQueue {
  /** Enqueue a work order for the worker to execute. Returns the queue's job id. */
  enqueue(order: WorkOrder): Promise<{ readonly jobId: string }>;
}

/** The subset of graphile-worker's WorkerUtils this queue needs. */
export interface JobAdder {
  addJob(
    identifier: string,
    payload?: unknown,
    spec?: { jobKey?: string; maxAttempts?: number },
  ): Promise<{ id: string }>;
}

/**
 * graphile-worker-backed {@link WorkQueue}. When the work order carries a task id
 * it is used as the job key so a re-dispatch of the same task replaces the
 * pending job rather than duplicating it (idempotent enqueue). Takes any
 * {@link JobAdder}, so it is unit-testable without a database; production wiring
 * uses {@link createGraphileWorkQueue}.
 */
export class GraphileWorkQueue implements WorkQueue {
  constructor(private readonly jobs: JobAdder) {}

  async enqueue(order: WorkOrder): Promise<{ readonly jobId: string }> {
    const job = await this.jobs.addJob(
      EXECUTE_WORK_ORDER_TASK,
      order,
      order.taskId !== undefined ? { jobKey: order.taskId } : {},
    );
    return { jobId: job.id };
  }
}

/**
 * Build a production {@link WorkQueue} bound to the durable queue. The connection
 * string comes from the environment / secrets manager, never from source (§8).
 * Call `release()` on shutdown to drain the underlying connection pool.
 */
export async function createGraphileWorkQueue(
  connectionString: string,
): Promise<{ queue: WorkQueue; release: () => Promise<void> }> {
  const utils = await makeWorkerUtils({ connectionString });
  return {
    queue: new GraphileWorkQueue(utils),
    release: () => Promise.resolve(utils.release()),
  };
}

/**
 * In-memory {@link WorkQueue} for the skeleton and tests: records enqueued orders
 * instead of dispatching them to a real queue.
 */
export class InMemoryWorkQueue implements WorkQueue {
  readonly enqueued: WorkOrder[] = [];
  private seq = 0;

  enqueue(order: WorkOrder): Promise<{ readonly jobId: string }> {
    this.enqueued.push(order);
    this.seq += 1;
    return Promise.resolve({ jobId: `mem-${this.seq}` });
  }
}
