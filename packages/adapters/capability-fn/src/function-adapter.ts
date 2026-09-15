import type {
  CapabilityAdapter,
  CapabilitySpec,
  CostEstimate,
  ErrorClass,
  ExecutionContext,
  HealthReport,
  UsageRecord,
} from '@donna/adapter-base';

export interface FunctionCapabilityOptions<TInput, TResult> {
  /** Stable adapter id — also the id the Work Router registry matches on. */
  readonly id: string;
  readonly name?: string;
  readonly version?: string;
  /** Abstract capabilities this adapter satisfies (e.g. `["crm.sync"]`). */
  readonly provides: readonly string[];
  /** The deterministic work. Must be idempotent w.r.t. `ctx.idempotencyKey`. */
  readonly handler: (input: TInput, ctx: ExecutionContext) => TResult | Promise<TResult>;
  /** Estimated cost in USD (default 0 — deterministic work is effectively free). */
  readonly estimateUsd?: number;
}

/**
 * A deterministic, in-process {@link CapabilityAdapter} (the `deterministic`
 * execution class). It adapts a plain handler function to the adapter contract
 * so the orchestrator can run it the same way it runs any capability — the
 * embodiment of "never invoke an LLM when deterministic software suffices"
 * (Build Bible V2-006). No provider SDK and no I/O of its own; the handler does
 * whatever deterministic work the capability needs.
 *
 * A thrown handler error is classified `deterministic` (a bug in the work, not a
 * transient fault), so the orchestrator does not retry it.
 */
export class FunctionCapabilityAdapter<
  TInput = unknown,
  TResult = unknown,
> implements CapabilityAdapter<TInput, TResult> {
  readonly id: string;
  readonly name: string;
  readonly version: string;

  private readonly provides: readonly string[];
  private readonly handler: (input: TInput, ctx: ExecutionContext) => TResult | Promise<TResult>;
  private readonly estimateUsd: number;
  private lastUsage: UsageRecord | undefined;

  constructor(options: FunctionCapabilityOptions<TInput, TResult>) {
    this.id = options.id;
    this.name = options.name ?? options.id;
    this.version = options.version ?? '1';
    this.provides = options.provides;
    this.handler = options.handler;
    this.estimateUsd = options.estimateUsd ?? 0;
  }

  capabilities(): CapabilitySpec {
    return { id: this.id, name: this.name, version: this.version, capabilities: this.provides };
  }

  health(): Promise<HealthReport> {
    return Promise.resolve({ status: 'healthy' });
  }

  estimate(): Promise<CostEstimate> {
    return Promise.resolve({ costUsd: this.estimateUsd, latencyMs: 0, confidence: 1 });
  }

  async execute(input: TInput, ctx: ExecutionContext): Promise<TResult> {
    const startedAt = Date.now();
    const result = await this.handler(input, ctx);
    this.lastUsage = { costUsd: this.estimateUsd, latencyMs: Date.now() - startedAt };
    return result;
  }

  reportUsage(): UsageRecord | undefined {
    return this.lastUsage;
  }

  classifyError(): ErrorClass {
    return 'deterministic';
  }
}
