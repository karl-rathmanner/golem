import { readStr } from './reader';
import { SchemType, SchemSymbol, SchemList, SchemFunction, SchemNil, SchemNumber, SchemBoolean } from './types';
import { pr_str } from './printer';
import { Env } from './env';

export function evalAST(ast: SchemType, env: Env): SchemType {
  if (ast instanceof SchemSymbol) {
    if (typeof env.find(ast) === 'undefined') {
      throw `Symbol ${ast.name} is undefined`;
    } else {
      return env.get(ast);
    }
  } else if (ast instanceof SchemList) {
      const evaluatedAST: SchemList = new SchemList();
      return ast.map((elemnt) => evalSchem(elemnt, env));
  } else {
    return ast;
  }
}

function evalSchem(ast: SchemType, env: Env): SchemType {
  if (!(ast instanceof SchemList)) {
    return evalAST(ast, env);
  } else if (ast instanceof SchemList) {
    if (ast.length === 0) {
      return ast;
    } else {
      const first: SchemType = ast[0];

      if (first instanceof SchemSymbol) {
        switch (first.name) {
          case 'def!': {
            return env.set(ast[1], evalSchem(ast[2], env));
          }
          case 'let*': {
            const childEnv = new Env(env);
            const bindingList = ast[1];

            if (!(bindingList instanceof SchemList)) {
              throw `first argument of let* has to be a list`;
            } else if (bindingList.length % 2 > 0) {
              throw `binding list contains uneven number of elements`;
            }

            for (let i = 0; i < bindingList.length; i += 2) {
              childEnv.set(bindingList[i], evalSchem(bindingList[i + 1], childEnv));
            }
            return evalSchem(ast[2], childEnv);
          }
          case 'do': {
            // evaluate all elements, starting from the second one, return only the last result
            const rest  = ast.splice(1);

            for (let i = 0; ; i++) {
              if (i < rest.length - 1) {
                evalSchem(rest[i], env);
              } else {
                 return evalSchem(rest[i], env);
              }
            }
          }
          case 'if': {
            const condition = evalSchem(ast[1], env);
            if (condition instanceof SchemBoolean && condition.valueOf() === false ||
                condition instanceof SchemNil) {
                return evalSchem(ast[3], env);
              } else {
                return evalSchem(ast[2], env);
              }
          }
          case 'fn*': {
            return new SchemNil();
          }
          default: {
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
      }
    }
  }

  return new SchemNil();
}

const replEnv: Env = new Env();

replEnv.set(SchemSymbol.from('+'), (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue) => accumulator + currentValue.valueOf())));

replEnv.addMap({
  '-': (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue) => accumulator - currentValue.valueOf())),
  '*': (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue) => accumulator * currentValue.valueOf())),
  '/': (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue) => accumulator / currentValue.valueOf())),
});


export function rep(str: string): string {
  return pr_str(evalSchem(readStr(str), replEnv));
}