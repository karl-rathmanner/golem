import { readStr } from './reader';
import { SchemType, SchemSymbol, SchemList, SchemFunction, SchemNil, SchemNumber, SchemBoolean, SchemVector, SchemMap, SchemKeyword, SchemMapKey, SchemString } from './types';
import { pr_str } from './printer';
import { Env, EnvSetupMap } from './env';
import { coreFunctions } from './core';
import { browser } from 'webextension-polyfill-ts';

export class Schem {

  async evalAST(ast: SchemType, env: Env): Promise<SchemType> {
    if (ast instanceof SchemSymbol) {
      if (typeof env.find(ast) === 'undefined') {
        throw `Symbol ${ast.name} is undefined`;
      } else {
        return env.get(ast);
      }
    } else if (ast instanceof SchemList || ast instanceof SchemVector) {
      // console.log('began list eval in evalAST in env ' + env.name);
      const evaluatedAST = (ast instanceof SchemList) ? new SchemList() : new SchemVector();
      for (let i = 0; i < ast.length; i++) {
        evaluatedAST[i] = await this.evalSchem(ast[i], env);
      }
      // console.log('finished list eval in evalAST in env ' + env.name);
      return evaluatedAST;
      // return ast.map((elemnt) => evalSchem(elemnt, env));
    } else if (ast instanceof SchemMap) {
      let m = new SchemMap();

      let flatAst = ast.flatten();

      for (let i = 0; i < flatAst.length; i += 2) {
        if ((flatAst[i] as SchemMapKey).isValidKeyType) {
          m.set(flatAst[i] as SchemMapKey, await this.evalSchem(flatAst[i + 1], env));
        }
      }

      return m;
    } else {
      return ast;
    }
  }

  /** Evaluates a Schem expression
   * @description
   * TCO hint: recursive Schem functions should call themselves from tail position. Consult stackoverflow.com in case of stack overflows.
  */
  async evalSchem(ast: SchemType, env: Env): Promise<SchemType> {

    // let tcoCounter = 0;
    fromTheTop: while (true) {
      // if (tcoCounter++ > 0) console.log(`tco: ${tcoCounter}`);
      // console.log('ast: ' + pr_str(ast));
      // console.log(ast);
      // console.log('env: ' + env.name);
      // console.log(env);
      // console.log('--------');
      await this.nextStep();
      if (!(ast instanceof SchemList)) {
        return await this.evalAST(ast, env);
      }

      if (ast instanceof SchemList) {
        if (ast.length === 0) {
          return ast;
        } else {
          const first: SchemType = ast[0];

          // SchemSymbols can be special forms
          if (first instanceof SchemSymbol) {

            switch (first.name) {

              case 'def!':
                if (ast[1] instanceof SchemSymbol) {
                  return env.set(ast[1] as SchemSymbol, await this.evalSchem(ast[2], env));
                } else {
                  throw `first argument of 'def!' must be a symbol`;
                }

              // (let* (symbol1 value1 symbol2 value2) expression)
              // Let creates a new child environment and binds a list of symbols and values, the following expression is evaluated in that environment
              case 'let*':
                const childEnv = new Env(env);
                const bindingList = ast[1];

                if (!(bindingList instanceof SchemList)) {
                  throw `first argument of let* has to be a list`;
                } else if (bindingList.length % 2 > 0) {
                  throw `binding list contains uneven number of elements`;
                }

                for (let i = 0; i < bindingList.length; i += 2) {
                  if (bindingList[i] instanceof SchemSymbol) {
                    childEnv.set(bindingList[i] as SchemSymbol, await this.evalSchem(bindingList[i + 1], childEnv));
                  } else {
                    throw `every uneven argument of 'let*' must be a symbol`;
                  }
                }

                // TCO: switch to the new environment
                env = childEnv;
                // TCO: evaluate the expression
                ast = ast[2];
                continue fromTheTop;

              case 'do':
                // evaluate elements, starting from the second one, but return the last one as is
                const evaluatedAST = new SchemList();
                // skip the ast's first (which was 'do') and last element (which will be evaluated during next loop iteration)
                for (let i = 1; i < ast.length - 1; i++) {
                  evaluatedAST.push(await this.evalSchem(ast[i], env));
                }

                ast = ast[ast.length - 1];
                continue fromTheTop;

              case 'if':
                const condition = await this.evalSchem(ast[1], env);
                if ((condition instanceof SchemBoolean && condition === SchemBoolean.false) || condition instanceof SchemNil) {
                  ast = ast[3];
                  continue;
                } else {
                  ast = ast[2];
                  continue fromTheTop;
                }

              case 'fn*':
                const [, params, fnBody] = ast;

                if (!(params instanceof SchemList || params instanceof SchemVector)) {
                  throw `expected list or vector`;
                }

                try {
                  let binds = params.asArrayOfSymbols();
                  return SchemFunction.fromSchem(this.evalSchem, env, params.asArrayOfSymbols(), fnBody);

                } catch (error) {
                  throw `binds list for new environments must only contain symbols`;
                }

              case 'eval':
                // (eval form) - evaluates the argument twice - effectively executing the form
                return await this.evalSchem(await this.evalSchem(ast[1], env), env);

            }
          }

          // Keywords evaluate to themselves
          if (first instanceof SchemKeyword) {
            return first;
          }

          // If first didn't match any of the above, evaluate all list elements and call the first element as a function using the others as arguments
          // const evaluatedAST: SchemList = evalAST(ast, env) as SchemList;
          const [f, ...args] = await this.evalAST(ast, env) as SchemList;

          if (f instanceof SchemFunction) {
            // console.log('calling function');
            // console.log(f.metadata.name);
            // console.log('args:');
            // console.log(args);

            if (f.fnContext) {
              // console.log('context:');
              // console.log(f.fnContext);
              // console.log(f.fnContext!.params);
              ast = f.fnContext.ast;
              env = new Env(f.fnContext.env, f.fnContext.params, args);
              // env = f.newEnv(args); // new Env(f.fnContext.env, f.fnContext.params, args);
              continue fromTheTop;
            } else {
              // console.log('no context');
              return await f.f(...args);
            }
          } else {
            throw `tried to invoke ${f} as a function, when it's type was ${typeof f}`;
          }
        }
      }

      return SchemNil.instance;
    }
  }

  replEnv: Env = new Env();
  constructor() {
    this.replEnv.addMap(coreFunctions);
    this.replEnv.def('load-url', '(fn* (f) (eval (read-string (str "(do " (slurp f) ")"))))', this);
  }

  async arep(expression: string, overwrites?: EnvSetupMap): Promise<string> {
    if (overwrites) {
      this.replEnv.addMap(overwrites, true);
    }
    return pr_str(await this.evalSchem(readStr(expression), this.replEnv));
  }

  delay(milliSeconds: number) {
    return new Promise(resolve => setTimeout(resolve, milliSeconds));
  }

  async nextStep(): Promise<void> {
    /* test for stepping through the execution
    return new Promise<void>(resolve => {
      browser.commands.onCommand.addListener((command) => {
        /// 'advanceSchemInterpreter' //'.addListener((m: {action: string, message: string}) => {
        if (command === 'advanceSchemInterpreter') {
            resolve();
        }
      });
    });
    */

    /* turbo mode
      await this.delay(100);
    */

    await true;
  }
}