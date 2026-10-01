# @donna/adapter-gmail

Gmail `CapabilityAdapter` for DONNA.

- `GoogleOAuth` — the web-server OAuth flow (consent URL, code exchange,
  refresh, revoke). Scopes: `openid email gmail.compose` — compose and send
  only; the mailbox can't be read.
- `GmailAdapter` — `draft.create` / `message.send` through the Gmail REST API,
  given an access-token provider. No secrets are held by the adapter.
- `buildRawMessage` / `validateMessage` — plain-text RFC 5322 messages with
  strict address checks and no CR/LF in headers (no header injection).

Gmail has no idempotency key: callers record each attempt before calling
`execute` and never auto-retry a send whose outcome is unknown. The
control-plane's `GmailService` does exactly that.
