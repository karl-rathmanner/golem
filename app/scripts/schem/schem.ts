import { readStr } from './reader';
import { SchemType, SchemSymbol, SchemList, SchemFunction, SchemNil } from './types';
import { pr_str } from './printer';
import { SchemEnvironment, replEnv } from './env';

export function evalAST(ast: SchemType, env: SchemEnvironment): SchemType {
  if (ast instanceof SchemSymbol) {
    if (typeof env[ast.name] === 'undefined') {
      throw `Symbol ${ast.name} is undefined`;
    } else {
      return env[ast.name];
    }
  } else if (ast instanceof SchemList) {
      const evaluatedAST: SchemList = new SchemList();
      return ast.map((elemnt) => evalSchem(elemnt, env));
  } else {
    return ast.valueOf();
  }
}

function evalSchem(ast: SchemType, env: SchemEnvironment): SchemType {
  if (!(ast instanceof SchemList)) {
    return evalAST(ast, env);
  } else if (ast instanceof SchemList) {
    if (ast.length === 0) {
      return ast;
    } else {
      const evaluatedAST: SchemList = evalAST(ast, env) as SchemList;
      const [f, ...rest] = evaluatedAST;
      console.log(f);
      console.log(typeof f);
      if (f instanceof Function) {
        return f(...rest);
      } else {
        throw `tried to invoke ${f} as a function, when it's type was ${f.type}`;
      }
    }
  }

  return new SchemNil();
}

export function rep(str: string): string {
  return pr_str(evalSchem(readStr(str), replEnv));
}