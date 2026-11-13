import { describe, expect, it } from 'vitest';
import { captureDiscussionRange, equalMonacoRange } from '../src/monaco-range';
import { parseMonacoModelUri } from '../src/monaco-main';
import type { MonacoDecoration, MonacoRange } from '../src/monaco-types';

const selected: MonacoRange = { startLineNumber: 35, startColumn: 5, endLineNumber: 38, endColumn: 58 };
const remote: MonacoRange = { startLineNumber: 39, startColumn: 1, endLineNumber: 39, endColumn: 62 };
const decoration = (range: MonacoRange): MonacoDecoration => ({ range, options: { inlineClassName: 'highlight-discussion-range' } });

describe('native Monaco discussion range capture', () => {
  it('captures exact multiline columns despite an existing remote highlight', () => {
    expect(captureDiscussionRange([decoration(remote), decoration(selected)], selected)).toEqual(selected);
  });
  it('freezes the native creation range rather than retaining a moving public selection/decorator object', () => {
    const range = { ...selected };
    const captured = captureDiscussionRange([decoration(remote), decoration(range)], range);
    range.startLineNumber = 41; range.startColumn = 1; range.endLineNumber = 41; range.endColumn = 4;
    expect(captured).toEqual(selected);
  });
  it('fails closed for ambiguous decorations without an exact matching selection', () => {
    expect(captureDiscussionRange([decoration(remote), decoration(selected)], null)).toBeUndefined();
    expect(captureDiscussionRange([decoration(remote), decoration(selected)], { ...selected, startColumn: 1 })).toBeUndefined();
  });
  it('does not mistake a neighboring remote comment for a new selection', () => {
    expect(captureDiscussionRange([decoration(remote)], selected)).toBeUndefined();
    expect(captureDiscussionRange([decoration(selected), decoration({ ...selected })], null)).toBeUndefined();
    expect(captureDiscussionRange([{ range: remote, options: { inlineClassName: 'other' } }], null)).toBeUndefined();
  });
  it('rejects invalid positions and distinguishes columns on the same lines', () => {
    expect(captureDiscussionRange([decoration({ ...selected, startColumn: 0 })], null)).toBeUndefined();
    expect(equalMonacoRange(selected, { ...selected, endColumn: 57 })).toBe(false);
  });
});

describe('public Monaco source identity', () => {
  it('requires repository, captured commit and repository-relative file path', () => {
    const commit = 'a'.repeat(40);
    expect(parseMonacoModelUri(`inmemory://model/git/repository-id/GC${commit}/src/MauiProgram.cs`)).toEqual({ repositoryId: 'repository-id', commit, filePath: '/src/MauiProgram.cs' });
    expect(parseMonacoModelUri('inmemory://model/2')).toBeUndefined();
    expect(parseMonacoModelUri(`file://model/git/repository-id/GC${commit}/src/MauiProgram.cs`)).toBeUndefined();
  });
});
