import { describe, expect, it } from 'vitest';

import { AUTHORITY_LEVELS, isAutonomouslyExecutable, requiresApproval } from './authority.js';
import { isDispatchable } from './compute-node.js';
import { isEventType } from './event.js';
import { isScope } from './scope.js';
import { isAiExecutionClass } from './task.js';
import { detectLinkProvider } from './work.js';

describe('authority model', () => {
  it('allows autonomous execution only up to routine actions', () => {
    expect(isAutonomouslyExecutable(AUTHORITY_LEVELS.OBSERVE)).toBe(true);
    expect(isAutonomouslyExecutable(AUTHORITY_LEVELS.ROUTINE_ACTION)).toBe(true);
    expect(isAutonomouslyExecutable(AUTHORITY_LEVELS.APPROVAL_REQUIRED)).toBe(false);
    expect(isAutonomouslyExecutable(AUTHORITY_LEVELS.NEVER_AUTONOMOUS)).toBe(false);
  });

  it('requires approval at level 3 and above', () => {
    expect(requiresApproval(AUTHORITY_LEVELS.ROUTINE_ACTION)).toBe(false);
    expect(requiresApproval(AUTHORITY_LEVELS.APPROVAL_REQUIRED)).toBe(true);
    expect(requiresApproval(AUTHORITY_LEVELS.NEVER_AUTONOMOUS)).toBe(true);
  });
});

describe('execution classes (Work Router above Model Router)', () => {
  it('identifies AI execution classes', () => {
    expect(isAiExecutionClass('local_ai')).toBe(true);
    expect(isAiExecutionClass('cloud_ai')).toBe(true);
    expect(isAiExecutionClass('deterministic')).toBe(false);
    expect(isAiExecutionClass('human')).toBe(false);
    expect(isAiExecutionClass('browser')).toBe(false);
  });
});

describe('compute node dispatch', () => {
  it('dispatches only to a healthy AUTO node', () => {
    expect(isDispatchable('AUTO', 'healthy')).toBe(true);
    expect(isDispatchable('AUTO', 'degraded')).toBe(false);
    expect(isDispatchable('AUTO', 'offline')).toBe(false);
    expect(isDispatchable('OFF', 'healthy')).toBe(false);
    expect(isDispatchable('LOCAL_ONLY', 'healthy')).toBe(false);
  });
});

describe('type guards', () => {
  it('validates scopes', () => {
    expect(isScope('ORGANIZATION')).toBe(true);
    expect(isScope('nonsense')).toBe(false);
  });

  it('validates event types', () => {
    expect(isEventType('task.completed')).toBe(true);
    expect(isEventType('task.exploded')).toBe(false);
  });
});

describe('detectLinkProvider', () => {
  it.each([
    ['https://drive.google.com/drive/folders/1', 'google_drive'],
    ['https://docs.google.com/document/d/1/edit', 'google_docs'],
    ['https://docs.google.com/spreadsheets/d/1', 'google_sheets'],
    ['https://docs.google.com/presentation/d/1', 'google_slides'],
    ['https://www.dropbox.com/s/x', 'dropbox'],
    ['https://acme.sharepoint.com/x', 'onedrive'],
    ['https://www.notion.so/x', 'notion'],
    ['https://www.figma.com/file/x', 'figma'],
    ['https://www.loom.com/share/x', 'loom'],
    ['https://github.com/a/b', 'github'],
    ['https://example.com', 'web'],
  ])('%s → %s', (url, provider) => {
    expect(detectLinkProvider(url)).toBe(provider);
  });

  it('rejects non-http(s) and malformed URLs', () => {
    expect(detectLinkProvider('javascript:alert(1)')).toBeNull();
    expect(detectLinkProvider('data:text/html,x')).toBeNull();
    expect(detectLinkProvider('not a url')).toBeNull();
    // A lookalike host is not Google Drive.
    expect(detectLinkProvider('https://drive.google.com.evil.io/x')).toBe('web');
  });
});
