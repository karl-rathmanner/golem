export const version: string;

export function indentMode(text: string, options?: options): result;
export function parenMode(text: string, options?: options): result;
export function smartMode(text: string, options?: options): result;

type options = {
  cursorX?: number;
  cursorLine?: number;
  prevCursorX?: number;
  prevCursorLine?: number;
  selectionStartLine?: number;
  changes?: {lineNo: number, x: number, oldText: string, newText: string};
  partialResult?: boolean;
  forceBalance?: boolean;
  returnParens?: boolean;
}

type result = {
  success: boolean,
  text: string
  cursorX: number,
  cursorLine: number,
  error?: {name: string, message: string, lineNo: number, x: number, extra: {lineNo: number, x: number}}
  tabStops: {x: number, argX: number, lineNo: number, ch: string} [],
  parenTrails: {lineNo: number, startX: number, endX: number} [], 
}