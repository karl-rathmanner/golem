import { browser } from 'webextension-polyfill-ts';
import { coreFunctions } from './core';
import { Env, EnvSetupMap } from './env';
import { pr_str } from './printer';
import { readStr } from './reader';
import { isCallable, isSequential, LazyVector, SchemAtom, SchemBoolean, SchemFunction, SchemList, SchemMap, SchemMapKey, SchemNil, SchemString, SchemSymbol, SchemType, SchemVector, isValidKeyType, SchemMetadata } from './types';

export class Schem {

  private coreLoaded: boolean;
  public replEnv: Env = new Env();
  public debug = {
    logArepInput : false,
    logEvalSchemCalls : false,
    logSchemFunctionInvocation : false,
    logEnvironmentInfo : false,
    pauseEvaluation: false
  };

  constructor() {
    this.replEnv.addMap(coreFunctions);
    this.coreLoaded = false;
    // Schem functions that need to reference the repl Environment go here - addMap doesn't support that
    this.replEnv.set('eval', (rand: SchemType) => this.evalSchem(rand, this.replEnv));
    this.replEnv.set('swap!', (atom: SchemAtom, fn: SchemFunction, ...rest: SchemType[]) => {
        atom.value = this.evalSchem(new SchemList(fn, atom.value, ...rest), this.replEnv);
        return atom.value;
      }
    );
    this.replEnv.set('resolve', (sym: SchemSymbol) => {
      try {
        const value = this.replEnv.get(sym);
        return value;
      } catch {
        return SchemNil.instance;
      }
    });

    // TODO: add the 'special' symbols to the environment instead of faking it
    this.replEnv.set('list-symbols', () => new SchemList(...this.replEnv.getSymbols().concat(
      SchemSymbol.from('def'), SchemSymbol.from('defmacro'), SchemSymbol.from('macroexpand'), SchemSymbol.from('macroexpand-all'), SchemSymbol.from('let'), SchemSymbol.from('do'),
      SchemSymbol.from('if'), SchemSymbol.from('quote'), SchemSymbol.from('quasiquote'), SchemSymbol.from('set-interpreter-options')
    )));
  }

  async evalAST(ast: SchemType, env: Env): Promise<SchemType> {
    if (ast instanceof SchemSymbol) {
      if (typeof env.find(ast) === 'undefined') {
        throw `Symbol ${ast.name} is undefined`;
      } else {
        return env.get(ast);
      }

    } else if (ast instanceof SchemList || ast instanceof SchemVector) {

      const evaluatedAST = (ast instanceof SchemList) ? new SchemList() : new SchemVector();
      for (let i = 0; i < ast.length; i++) {
        evaluatedAST[i] = await this.evalSchem(ast[i], env);
      }

      return evaluatedAST;
    } else if (ast instanceof LazyVector) {

      const evaluatedAST = new SchemVector();
      for (let i = 0; i < ast.count(); i++) {
        evaluatedAST[i] = await this.evalSchem((ast.nth(i) as SchemType), env);
      }

      return evaluatedAST;
    } else if (ast instanceof SchemMap) {
      let m = new SchemMap();

      let flatAst = ast.flatten();

      for (let i = 0; i < flatAst.length; i += 2) {
        if (isValidKeyType(flatAst[i])) {
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
  async evalSchem(ast: SchemType, env: Env = this.replEnv): Promise<SchemType> {
  let tcoCounter = 0;

  fromTheTop: while (true) {

      if (this.debug.logEvalSchemCalls) {
        if (tcoCounter++ === 0) {
          console.log('evalSchem was called.');
        } else {
          console.log(`evalSchem looped. Number of recursions skipped due to TCO: ${tcoCounter}`);
        }
        console.group();
        console.log('ast: ' + await pr_str(ast));
        console.log(ast);
        console.log('env: ' + env.name);
        console.log(env);
        console.groupEnd();
      }

      await this.nextStep();
      if (!(ast instanceof SchemList)) {
        return await this.evalAST(ast, env);
      }

      ast = await this.macroExpand(ast, env);
      if (!(ast instanceof SchemList)) {
        return this.evalAST(ast, env);
      }

      if (ast instanceof SchemList) {
        if (ast.length === 0) {
          return ast;
        } else {
          const first: SchemType = ast[0];

          // SchemSymbols can indicate special forms
          if (first instanceof SchemSymbol) {
            switch (first.name) {
              /** (def symbol value)
               * Binds a value to a symbol in the current environment
               */
              case 'def':
                if (ast[1] instanceof SchemSymbol) {
                  return env.set(ast[1] as SchemSymbol, await this.evalSchem(ast[2], env));
                } else {
                  throw `first argument of 'def' must be a symbol`;
                }

              /** (defmacro name fn)
               * Binds a function to a symbol and sets its isMacro flag.
               */
              case 'defmacro':
                const [, sym, val] = ast;
                if (sym instanceof SchemSymbol) {
                  const macroFunction = await this.evalSchem(val, env);

                  if (!(macroFunction instanceof SchemFunction)) {
                    throw `only functions can be macros`;
                  } else {
                    macroFunction.isMacro = true;
                    return env.set(sym, macroFunction);
                  }

                } else {
                  throw `first argument of 'def' must be a symbol`;
                }
              /** (let (symbol1 value1 symbol2 value2 ...) expression) or (let [symbol1 value1 symbol2 value2 ...] expression)
               * Creates a new child environment and binds a list of symbols and values, the following expression is evaluated in that environment
               */
              case 'let':
                const childEnv = new Env(env);
                const bindingList = ast[1];

                if (!(isSequential(bindingList))) {
                  throw `first argument of let has to be a list`;
                } else if (bindingList.length % 2 > 0) {
                  throw `binding list contains uneven number of elements`;
                }

                for (let i = 0; i < bindingList.length; i += 2) {
                  if (bindingList[i] instanceof SchemSymbol) {
                    childEnv.set(bindingList[i] as SchemSymbol, await this.evalSchem(bindingList[i + 1], childEnv));
                  } else {
                    throw `every uneven argument of 'let' must be a symbol`;
                  }
                }

                // TCO: switch to the new environment
                env = childEnv;
                // TCO: evaluate the expression
                ast = ast[2];
                continue fromTheTop;

              /** (do x y & more)
               * Evaluates all elements in sequence, but only returns the last one.
               */
              case 'do':
                // return nil if do isn't followed by any expressions
                if (ast.length === 1) {
                  return SchemNil.instance;
                }
                // evaluate elements, starting from the second one, but return the last one as is
                const evaluatedAST = new SchemList();
                // skip the ast's first (which was 'do') and last element (which will be evaluated during next loop iteration)
                for (let i = 1; i < ast.length - 1; i++) {
                  evaluatedAST.push(await this.evalSchem(ast[i], env));
                }

                ast = ast[ast.length - 1];
                continue fromTheTop;

              /** (if condition x y)
               * returns x if condition is true; otherwise returns y
               */
              case 'if':
                if (ast.length < 3) {
                  throw `if must be followed by at least two arguments`;
                }
                const condition = await this.evalSchem(ast[1], env);
                if ((condition instanceof SchemBoolean && condition === SchemBoolean.false) || condition instanceof SchemNil) {
                  ast = (typeof ast[3] === 'undefined') ? SchemNil.instance : ast[3];
                  continue;
                } else {
                  ast = ast[2];
                  continue fromTheTop;
                }

              /** (fn name? [parameters] (functionBody)
               *  Defines a new function in the current environment. When it's colled, the function body gets executed in a new child environmet.
               *  In this child environmet, the symbols provided in parameters are bound to he values provided as arguments by the caller.
              */
              case 'fn':
                let name, params, fnBody;

                if (ast[1] instanceof SchemSymbol) {
                  [, name, params, fnBody] = ast;
                  name = (name as SchemSymbol).name;
                } else {
                  [, params, fnBody] = ast;
                }

                if (!(params instanceof SchemList || params instanceof SchemVector)) {
                  throw `expected a list or vector of parameters`;
                }

                try {
                  let binds = params.asArrayOfSymbols();
                  let metadata: SchemMetadata = {};
                  if (name) metadata.name = name;
                  return SchemFunction.fromSchemWithContext(this, env, binds, fnBody, metadata);

                } catch (error) {
                  throw `binds list for new environments must only contain symbols`;
                }

              /** (quote list)
               * Returns list without evaluating it
               */
              case 'quote':
                return ast[1];

              /** (quasiquote list)
               * Acts like quote, unless a nested list starts with the symbols unquote or splice unquote.
              */
              case 'quasiquote':
                ast = this.evalQuasiquote(ast[1]);
                continue fromTheTop;

              /** (macroexpand (m))
               * explicitly expand one level of a macro function
              */
              case 'macroexpand':
                return await this.macroExpand(ast[1], env);

              /** (macroexpandAll (m))
               * explicitly expand all macro functions (even nested ones)
              */
              case 'macroexpand-all':
                return await this.macroExpandAll(ast, env);

              /** (set-interpreter-options map) changes interpreter settings
               *  e.g.: (set-interpreter-options {"logArepInput" true "pauseEvaluation" false}) */
              case 'set-interpreter-options':
                const options = await this.evalAST(ast[1], env);
                if (!(options instanceof SchemMap)) throw `(set-interpreter-options options) options must be a map`;

                options.forEach((value, key) => {
                  if (key instanceof SchemString && value instanceof SchemBoolean && key.valueOf() in this.debug) {
                    (this.debug as any)[key.valueOf()] = value.valueOf();  // typecost is necessary, because the debug options literal lacks a string indexer – but we allready checked if the object has that key, so it's all good
                  }
                  return void 0;
                });
                return SchemNil.instance;

            }
          }

          // If first didn't match any of the above, treat it as a function: evaluate all list elements and call the first element using the others as arguments
          const [f, ...args] = await this.evalAST(ast, env) as SchemList;

          if (isCallable(f)) {
            if (f instanceof SchemFunction) {
              if (this.debug.logSchemFunctionInvocation) {
                console.log('invoking a Schem function');
                console.group();
                console.log(f.metadata);
                console.log('args:');
                console.log(args);
              }
              if (f.fnContext) {

                if (this.debug.logSchemFunctionInvocation) {
                  console.log('Function was defined in Schem and has a context object:');
                  console.log(f.fnContext);
                }

                ast = f.fnContext.ast;
                env = new Env(f.fnContext.env, f.fnContext.params, args);
                console.groupEnd();
                continue fromTheTop;

              } else {
                if (this.debug.logSchemFunctionInvocation) {
                  console.log('Function has no context.');
                  console.groupEnd();
                }
                return await f.invoke(...args);
              }
            } else {
              ast = f.invoke(...args);
              continue fromTheTop;
            }
          } else {
            throw `Invalid form: first element is not callable`;
          }
        }
      }

      return SchemNil.instance;
    }
  }

  evalQuasiquote(ast: SchemType): SchemType {
    if (isSequential(ast)) {
      if (ast.length === 0) {
        // ast is an empty list -> quote it
        return new SchemList(SchemSymbol.from('quote'), ast);
      }

      const nonEmptyList = ast;
      if (nonEmptyList[0] instanceof SchemSymbol && (nonEmptyList[0] as SchemSymbol).name === 'unquote') {
        // ast looks like: (unquote x) -> return just x, so it's going to be evaluated
        return nonEmptyList[1];
      }

      const [, ...secondTroughLastElements] = nonEmptyList;

      if (isSequential(nonEmptyList[0])) {
        const innerList = (nonEmptyList[0] as SchemList);
        if (innerList[0] instanceof SchemSymbol && (innerList[0] as SchemSymbol).name === 'splice-unquote') {
          // ast looks like: ((splice-unquote (a b c)) d e f) -> concatenate the result of evaluating (a b c) and whatever the result calling evalQuasiquote wit "d e f" is going to be
          return new SchemList(SchemSymbol.from('concat'), innerList[1], this.evalQuasiquote(new SchemList(...secondTroughLastElements)));
        }
      }

      // recursively call evalQuasiquote with the first element of the list and with the rest of the list, construct a new list with the results
      return new SchemList(SchemSymbol.from('cons'), this.evalQuasiquote(nonEmptyList[0]), this.evalQuasiquote(new SchemList(...secondTroughLastElements)));

    } else {
      // ast is not a list -> quote it
      return new SchemList(SchemSymbol.from('quote'), ast);
    }
  }

  async arep(expression: string, overwrites?: EnvSetupMap): Promise<string> {
    if (typeof expression === 'undefined' || expression.length === 0) {
      expression = 'nil';
    }
    if (!this.coreLoaded) {
      this.coreLoaded = true; // technically, this isn't quite true, as core.schem isn't actually loaded yet, but the flag has to be set so the call to arep below may return
        const core = require('!raw-loader!../schemScripts/core.schem');
        await this.arep(core);
    }
    if (overwrites) {
      this.replEnv.addMap(overwrites, true);
    }

    if (this.debug.logArepInput) console.log('evaluating: ' + expression);
    return await pr_str(await this.evalSchem(readStr(expression), this.replEnv));
  }

  async readEval(expression: string): Promise<SchemType> {
    if (typeof expression === 'undefined' || expression.length === 0) {
      return SchemNil.instance;
    }
    return await this.evalSchem(readStr(expression), this.replEnv);
  }

  delay(milliSeconds: number) {
    return new Promise(resolve => setTimeout(resolve, milliSeconds));
  }

  /**
   * Returns the isMacro flag of the ast's first element
   * @param ast Abstract Syntax Tree
   * @param env The Environment the call will be evaluated in
   */
  isMacroCall(ast: SchemType, env: Env) {
    if (ast instanceof SchemList && ast[0] instanceof SchemSymbol) {
      try {
        const val = env.get(ast[0] as SchemSymbol);
        return (val instanceof SchemFunction && val.isMacro);
      } catch {
        // the symbol could not be found
        return false;
      }
    } else {
      // ast is not a list starting with a symbol
      return false;
    }
  }

  /** Expands the macro at the beginning of a list (repeatedly) */
  async macroExpand(ast: SchemType, env: Env) {
    while (this.isMacroCall(ast, env)) {
      const [symbol, ...rest] = ast as SchemList;
      // the following typecasts are safe because isMacroCall returned true
      const macroFunction = env.get(symbol as SchemSymbol) as SchemFunction;
      ast = await macroFunction.f(...rest);
    }
    return ast;
  }

  /** Recursively expands macro all functions in an abstract syntax tree */
  async macroExpandAll(ast: SchemType, env: Env): Promise<SchemType> {
    if (ast instanceof SchemList) {
      return new SchemList(...await Promise.all<SchemType>(
        ast.map(async (element) => {
          // expand every node
          let expandedElement = await this.macroExpand(element, env);
          // expand their children
          return this.macroExpandAll(expandedElement, env);
        })));
    }
    return ast;
  }

  async nextStep(): Promise<void> {
    if (this.debug.pauseEvaluation) {
      return new Promise<void>(resolve => {
        browser.commands.onCommand.addListener((command) => {
          /// 'advanceSchemInterpreter' //'.addListener((m: {action: string, message: string}) => {
          if (command === 'advanceSchemInterpreter') {
              resolve();
          }
        });
      });
    }

    /* turbo mode
      await this.delay(100);
    */

    await true;
  }

}

/** Returns all elements in an indexed & possibly nested SchemCollection as a flat array. Searches depth first. */
export function filterRecursively(ast: SchemType, predicate: (element: SchemType) => boolean): SchemType[] {
  let results = Array<SchemType>();
  let currentElement: SchemType;
  function notUndefinedOrString(o: any) {
    return (typeof o !== 'undefined' && typeof o !== 'string');
  }

  // test the collection itself (if it even is one)
  if (predicate(ast)) {
    results.push(ast);
  }

  // iterate over ast as long as it's an indexable collection
  for (let i = 0; notUndefinedOrString((ast as any)[i]); i++) {
    currentElement = (ast as any)[i];

    // if an element is itself an indexable collection, filter its contents and add them to results
    // if (notUndefinedOrString((currentElement as any)[i])) {
    if (notUndefinedOrString((currentElement as any)[0])) {
      results.push(...this.filterRecursively(currentElement, predicate));
    } else if (predicate(currentElement)) {
      results.push(currentElement);
    }
  }

  return results;
}