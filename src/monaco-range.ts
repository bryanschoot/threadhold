import type { MonacoDecoration, MonacoRange } from './monaco-types';

export function equalMonacoRange(left: MonacoRange, right: MonacoRange): boolean {
  return left.startLineNumber === right.startLineNumber && left.startColumn === right.startColumn &&
    left.endLineNumber === right.endLineNumber && left.endColumn === right.endColumn;
}
export function validMonacoRange(range: MonacoRange): boolean {
  return [range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn].every(value => Number.isSafeInteger(value) && value > 0) &&
    (range.endLineNumber > range.startLineNumber || (range.endLineNumber === range.startLineNumber && range.endColumn >= range.startColumn));
}
/** Snapshot at native textarea creation, never a later moving editor selection. */
export function captureDiscussionRange(decorations: MonacoDecoration[], selection: MonacoRange | null): MonacoRange | undefined {
  const range = selection && decorations.find(item =>
    item.options.inlineClassName === 'highlight-discussion-range' &&
    validMonacoRange(item.range) && equalMonacoRange(item.range, selection))?.range;
  if (!range) return;
  return { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.endColumn };
}
