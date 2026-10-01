import { useRef, useState, type FormEvent } from 'react';

import type { ControlPlaneClient } from '../api/client';
import type { AttachmentTarget, AttachmentView } from '../types';
import { SectionHead, describe } from './ui';

const PROVIDER_LABEL: Record<string, string> = {
  google_drive: 'Drive',
  google_docs: 'Docs',
  google_sheets: 'Sheets',
  google_slides: 'Slides',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',
  notion: 'Notion',
  figma: 'Figma',
  loom: 'Loom',
  github: 'GitHub',
  web: 'Link',
};

function badge(a: AttachmentView): string {
  if (a.kind === 'link') return PROVIDER_LABEL[a.provider ?? 'web'] ?? 'Link';
  const ext = a.title.includes('.') ? a.title.split('.').pop() : undefined;
  return ext !== undefined && ext.length <= 5 ? ext.toUpperCase() : 'File';
}

function size(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  client: ControlPlaneClient;
  target: AttachmentTarget;
  items: AttachmentView[];
  onChange: (items: AttachmentView[]) => void;
  /** Heading text, e.g. "Files & links". */
  label?: string;
}

/**
 * Files and links on any level of the hierarchy. Paste a Google Drive (or
 * Docs, Dropbox, Figma, Notion… any https) link, or upload files up to 10 MB.
 */
export function Attachments({ client, target, items, onChange, label = 'Files & links' }: Props) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addLink(e: FormEvent) {
    e.preventDefault();
    const value = url.trim();
    if (value === '' || busy !== null) return;
    setBusy('Adding link…');
    setError(null);
    try {
      const added = await client.addLink(target, value);
      onChange([...items, added]);
      setUrl('');
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(null);
    }
  }

  async function upload(files: FileList | null) {
    if (files === null || files.length === 0) return;
    setError(null);
    const added: AttachmentView[] = [];
    try {
      for (const file of Array.from(files)) {
        setBusy(`Uploading ${file.name}…`);
        added.push(await client.uploadFile(target, file));
      }
    } catch (err) {
      setError(describe(err));
    } finally {
      if (added.length > 0) onChange([...items, ...added]);
      setBusy(null);
      if (fileRef.current !== null) fileRef.current.value = '';
    }
  }

  async function open(a: AttachmentView) {
    if (a.kind === 'link' && a.url !== null) {
      window.open(a.url, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      setBusy(`Opening ${a.title}…`);
      const blob = await client.downloadAttachment(a.id);
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = a.title;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(a: AttachmentView) {
    setError(null);
    try {
      await client.deleteAttachment(a.id);
      onChange(items.filter((x) => x.id !== a.id));
    } catch (err) {
      setError(describe(err));
    }
  }

  return (
    <section className="mt-10" aria-label={label}>
      <SectionHead
        label={label}
        count={items.length}
        action={
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent"
          >
            + Upload
          </button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        multiple
        aria-label="Upload files"
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
      />
      <ul>
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-3 border-b border-edge/60 py-3">
            <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
              {badge(a)}
            </span>
            <button
              type="button"
              onClick={() => void open(a)}
              className="min-w-0 flex-1 truncate text-left text-[15px] text-ink underline decoration-edge underline-offset-4 hover:decoration-accent"
            >
              {a.title}
            </button>
            {a.kind === 'file' && (
              <span className="shrink-0 font-mono text-[10px] text-faint">{size(a.sizeBytes)}</span>
            )}
            <button
              type="button"
              aria-label={`Remove ${a.title}`}
              onClick={() => void remove(a)}
              className="shrink-0 px-1 font-mono text-sm text-faint hover:text-danger"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => void addLink(e)}
        className="flex items-center gap-3 border-b border-edge/60 py-3"
      >
        <span aria-hidden="true" className="font-mono text-sm text-accent">
          +
        </span>
        <input
          aria-label="Paste a link"
          type="url"
          inputMode="url"
          value={url}
          disabled={busy !== null}
          placeholder="Paste a Drive, Docs, Dropbox or any link"
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
        />
        {url.trim() !== '' && (
          <button
            type="submit"
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent"
          >
            Attach
          </button>
        )}
      </form>
      {busy !== null && (
        <p
          role="status"
          className="pt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-accent"
        >
          {busy}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="pt-2 font-mono text-[11px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
