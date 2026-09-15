import { Webhook, WebhookVerificationError } from 'svix';

export { WebhookVerificationError };

/**
 * Verifies the signature on an inbound webhook and returns its parsed body. The
 * webhook endpoint writes to our tables, so the Svix signature IS its
 * authentication — an unsigned or tampered request is rejected before any DB
 * work. Injectable so the route can be tested without the real signing secret.
 */
export interface WebhookVerifier {
  /** Verify the raw request body against the Svix headers; throws on failure. */
  verify(rawBody: string, headers: Record<string, string>): unknown;
}

/**
 * Svix-backed verifier (Clerk signs its webhooks with Svix). The signing secret
 * (`whsec_…`) comes from the Clerk dashboard via the environment, never source
 * (§8). Verification is HMAC over the raw body with a timestamp-tolerance check
 * for replay protection — all handled by the vetted `svix` library.
 */
export class SvixWebhookVerifier implements WebhookVerifier {
  private readonly webhook: Webhook;

  constructor(secret: string) {
    this.webhook = new Webhook(secret);
  }

  verify(rawBody: string, headers: Record<string, string>): unknown {
    return this.webhook.verify(rawBody, headers);
  }
}
