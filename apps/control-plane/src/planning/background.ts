/**
 * Fire-and-forget work inside the API process (model calls that outlive the
 * request). Failures are recorded by the job itself; this only guarantees an
 * unhandled rejection never crashes the server. `idle()` lets tests wait.
 *
 * State lives in Postgres, so a restart mid-job leaves a `drafting` row that
 * reads as `timed_out` after its timeout and can simply be retried.
 */
export class Background {
  private readonly pending = new Set<Promise<void>>();

  run(job: () => Promise<void>): void {
    const p: Promise<void> = job()
      .catch((error: unknown) => {
        console.error('[background] job failed:', error instanceof Error ? error.message : error);
      })
      .finally(() => {
        this.pending.delete(p);
      });
    this.pending.add(p);
  }

  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }
}
