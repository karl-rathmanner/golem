import { readStr } from './reader';
import { SchemType } from './types';
import { pr_str } from './printer';

// EVAL
export function evalSchem(ast: any, _env?: any): any {
  console.log(ast);
  return ast;
}

export function rep(str: string): string {
  return pr_str(evalSchem(readStr(str)));
}