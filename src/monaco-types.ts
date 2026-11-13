import type { Anchor, Scope } from './contracts';

export interface MonacoContext {
  scope: Scope;
  sourceCommit: string;
  targetCommit: string;
  latestIteration: number;
}
export interface MonacoBinding {
  textareaId: string;
  anchor: Anchor;
  uri: string;
}
export interface MonacoDraftSlot { id: string; anchor: Anchor }
export type MonacoRequest =
  | { action: 'read'; context: MonacoContext }
  | { action: 'sync'; context: MonacoContext }
  | { action: 'open'; scope: Scope; id: string };
export type MonacoResponse =
  | { ok: true; bindings?: MonacoBinding[] }
  | { ok: false; error: { code: string; message: string } };
export type MonacoCommand =
  | { action: 'read'; context: MonacoContext }
  | { action: 'sync'; context: MonacoContext; slots: MonacoDraftSlot[] }
  | { action: 'open'; scope: Scope; anchor: Anchor };
export interface MonacoController {
  execute(command: MonacoCommand): Promise<MonacoBinding[] | void>;
}
declare global {
  interface Window { __threadholdMonaco?: MonacoController }
}

/** Only the documented Monaco APIs used by the bridge; no private editor fields. */
export interface MonacoRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}
export interface MonacoDecoration { range: MonacoRange; options: { inlineClassName?: string | null } }
export interface MonacoModel {
  uri: { toString(): string };
  getAllDecorations(): MonacoDecoration[];
  getLineCount(): number;
  getLineMaxColumn(lineNumber: number): number;
}
export interface MonacoDisposable { dispose(): void }
export interface MonacoViewZone { afterLineNumber: number; heightInPx: number; domNode: HTMLElement; suppressMouseDown?: boolean }
export interface MonacoZoneAccessor {
  addZone(zone: MonacoViewZone): string;
  removeZone(id: string): void;
  layoutZone(id: string): void;
}
export interface MonacoEditor {
  getDomNode(): HTMLElement | null;
  getModel(): MonacoModel | null;
  getSelection(): MonacoRange | null;
  setSelection(range: MonacoRange): void;
  revealRangeInCenter(range: MonacoRange): void;
  focus(): void;
  changeViewZones(callback: (accessor: MonacoZoneAccessor) => void): void;
  onDidDispose(callback: () => void): MonacoDisposable;
  onDidChangeModel(callback: () => void): MonacoDisposable;
}
export interface MonacoNamespace {
  getModels(): MonacoModel[];
  getEditors?(): MonacoEditor[];
  onDidCreateEditor(callback: (editor: MonacoEditor) => void): MonacoDisposable;
}
