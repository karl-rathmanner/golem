import { readStr } from './reader';
import { SchemType, SchemSymbol, SchemList, SchemFunction, SchemNil, SchemNumber, SchemBoolean } from './types';
import { pr_str } from './printer';
import { Env, EnvSetupMap } from './env';
import { coreFunctions } from './core';

export function evalAST(ast: SchemType, env: Env): SchemType {
  if (ast instanceof SchemSymbol) {
    if (typeof env.find(ast) === 'undefined') {
      throw `Symbol ${ast.name} is undefined`;
    } else {
      return env.get(ast);
    }
  } else if (ast instanceof SchemList) {
    // const evaluatedAST: SchemList = new SchemList();
    return ast.map((elemnt) => evalSchem(elemnt, env));
  } else {
    return ast;
  }
}

/** Evaluates a Schem expression
 * @description
 * TCO hint: recursive Schem functions should call themselves from tail position. Consult stackoverflow.com in case of stack overflows.
*/

export function evalSchem(ast: SchemType, env: Env): SchemType {
  fromTheTop: while (true) {
    if (!(ast instanceof SchemList)) {
      return evalAST(ast, env);
    }

    if (ast instanceof SchemList) {
      if (ast.length === 0) {
        return ast;
      } else {
        const first: SchemType = ast[0];

        if (first instanceof SchemSymbol) {
          switch (first.name) {
            case 'def!': {
              if (ast[1] instanceof SchemSymbol) {
                return env.set(ast[1] as SchemSymbol, evalSchem(ast[2], env));
              } else {
                throw `first argument of 'def!' must be a symbol`;
              }
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
                if (bindingList[i] instanceof SchemSymbol) {
                  childEnv.set(bindingList[i] as SchemSymbol, evalSchem(bindingList[i + 1], childEnv));
                } else {
                  throw `first argument of 'def!' must be a symbol`;
                }
              }

              // return evalSchem(ast[2], childEnv);
              env = childEnv;
              ast = ast[2];
              continue fromTheTop;
            }
            case 'do': {
              // evaluate all elements, starting from the second one, return only the last result

              ast.map((element, index) => {
                if (index === 0 || index === (ast as SchemType[]).length - 1) return; // skip first (was 'do') and last element (will be evaluated during next loop iteration)
                return evalAST(new SchemList(element), env);
              });

              ast = ast[ast.length - 1];
              continue fromTheTop;

            }
            case 'if': {
              const condition = evalSchem(ast[1], env);
              if (condition instanceof SchemBoolean && condition.valueOf() === false ||
              condition instanceof SchemNil) {
                // return evalSchem(ast[3], env);
                ast = ast[3];
                continue;
              } else {
                // return evalSchem(ast[2], env);
                ast = ast[2];
                continue fromTheTop;
              }
            }
            case 'fn*': {
              const [, params, exprs] = ast;

              if (!(params instanceof SchemList)) {
                throw `expected list`;
              }


              const binds = params.asArrayOfSymbols();
              try {
              } catch (error) {
                throw `binds list for new environments must only contain symbols`;
              }

              return new SchemFunction((...args: SchemType[]) => {
                return evalSchem(exprs, new Env(env, binds, args));
              }, {ast: exprs, params: params, env: env});
            }
          }
        }

        const evaluatedAST: SchemList = evalAST(ast, env) as SchemList;
        const [f, ...rest] = evaluatedAST;

        if (f instanceof SchemFunction) {
          if (f.fnContext) {
            ast = f.fnContext.ast;

            env = new Env(f.fnContext.env, f.fnContext.params.asArrayOfSymbols(), rest);
            continue fromTheTop;
          } else {
            return f.f(...rest);
          }
        } else {
          throw `tried to invoke ${f} as a function, when it's type was ${typeof f}`;
        }
      }
    }

    return SchemNil.instance;
  }
}

const replEnv: Env = new Env();
replEnv.addMap(coreFunctions);

/** Read, evaluate, print a Schem expression */
export function rep(expression: string, overwrites?: EnvSetupMap): string {
  if (overwrites) {
    replEnv.addMap(overwrites, true);
  }
  return pr_str(evalSchem(readStr(expression), replEnv));
}