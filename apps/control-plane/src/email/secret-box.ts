import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Symmetric protection for secrets the control-plane must store or hand to a
 * browser round trip: AES-256-GCM for refresh tokens at rest, HMAC-SHA256 for
 * OAuth `state`. The 32-byte key comes from `DONNA_SECRET_KEY` (base64) and
 * never from source. Separate subkeys are derived per purpose.
 */
export class SecretBox {
  private readonly encKey: Buffer;
  private readonly macKey: Buffer;

  constructor(key: Buffer) {
    if (key.length !== 32) throw new Error('DONNA_SECRET_KEY must decode to 32 bytes.');
    this.encKey = createHmac('sha256', key).update('donna.encrypt.v1').digest();
    this.macKey = createHmac('sha256', key).update('donna.sign.v1').digest();
  }

  /** Parses a base64 (or base64url) 32-byte key; `null` when absent/invalid. */
  static fromEnv(value: string | undefined): SecretBox | null {
    if (value === undefined || value.trim() === '') return null;
    const key = Buffer.from(value.trim(), 'base64');
    return key.length === 32 ? new SecretBox(key) : null;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), ct]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  /** Throws if the ciphertext was tampered with or made with another key. */
  decrypt(sealed: string): string {
    const [version, iv, tag, ct] = sealed.split('.');
    if (version !== 'v1' || iv === undefined || tag === undefined || ct === undefined) {
      throw new Error('Unrecognized sealed secret.');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ct, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** A tamper-evident, expiring token carrying `payload`. */
  sign(payload: Record<string, unknown>, ttlMs: number, now = Date.now()): string {
    const body = Buffer.from(
      JSON.stringify({ ...payload, exp: now + ttlMs, n: randomBytes(8).toString('hex') }),
    ).toString('base64url');
    return `${body}.${this.mac(body)}`;
  }

  /** The payload if the token is authentic and unexpired, else `null`. */
  verify(token: string, now = Date.now()): Record<string, unknown> | null {
    const [body, mac] = token.split('.');
    if (body === undefined || mac === undefined) return null;
    const expected = Buffer.from(this.mac(body));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
      return typeof payload['exp'] === 'number' && payload['exp'] > now ? payload : null;
    } catch {
      return null;
    }
  }

  private mac(body: string): string {
    return createHmac('sha256', this.macKey).update(body).digest('base64url');
  }
}
