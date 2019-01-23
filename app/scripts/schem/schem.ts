import { browser } from 'webextension-polyfill-ts';
import { SchemContextManager } from '../contextManager';
import { getJsProperty, interopFunctions, invokeJsProcedure, schemToJs } from '../javascriptInterop';
import { coreFunctions } from './core';
import { Env, EnvSetupMap } from './env';
import { pr_str } from './printer';
import { readStr } from './reader';
import { isCallable, isSchemBoolean, isSchemContextSymbol, isSchemFunction, isSchemJSReference, isSchemLazyVector, isSchemList, isSchemMap, isSchemNil, isSchemString, isSchemSymbol, isSchemVector, isSequential, isValidKeyType } from './typeGuards';
import { AnySchemType, SchemAtom, SchemBoolean, SchemContextDefinition, SchemFunction, SchemKeyword, SchemList, SchemMap, SchemMapKey, SchemMetadata, SchemNil, SchemString, SchemSymbol, SchemVector } from './types';

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
  private hasAccessToFullBrowserAPI = false;
  private contextManager: SchemContextManager;

  constructor() {
    this.replEnv.addMap(coreFunctions);
    this.replEnv.addMap(interopFunctions);
    // bind bottom types and global objects so they show up in autocompletion
    this.replEnv.set('null', null);
    this.replEnv.set('undefined', undefined);
    this.replEnv.set('window', window);
    this.replEnv.set('document', document);
    this.replEnv.set('browser', browser);
    this.replEnv.set('chrome', chrome);
    this.coreLoaded = false;
    // Schem functions that need to reference the repl Environment go here - addMap doesn't support that
    this.replEnv.set('eval', (rand: AnySchemType) => this.evalSchem(rand, this.replEnv));
    this.replEnv.set('swap!', async (atom: SchemAtom, fn: SchemFunction, ...rest: AnySchemType[]) => {
        atom.setValue(await this.evalSchem(new SchemList(fn, atom.getValue(), ...rest), this.replEnv));
        return atom.getValue();
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

    this.replEnv.set('list-symbols', () => new SchemList(...this.replEnv.getSymbols()));

    if (browser.extension != null) {

      if (browser.extension.getBackgroundPage != null && browser.extension.getBackgroundPage() != null) {
        this.hasAccessToFullBrowserAPI = true;
        const priviledgedContext = browser.extension.getBackgroundPage().golem.priviledgedContext;
        if (typeof priviledgedContext === 'undefined') {
          throw new Error(`priviledged context is not set up`);
        }

        this.contextManager = priviledgedContext.contextManager;
      }
    }

  }

  async evalAST(ast: AnySchemType, env: Env): Promise<AnySchemType> {
    if (isSchemSymbol(ast)) {
      // js interop: evaluate to object value
      if (SchemSymbol.refersToJavascriptObject(ast)) {
        return getJsProperty(ast.name);
      }

      if (typeof env.find(ast) === 'undefined') {
        throw `Symbol ${ast.name} is undefined`;
      } else {
        return env.get(ast);
      }

    } else if (isSchemList(ast) || ast instanceof SchemVector) {

      const evaluatedAST = (isSchemList(ast)) ? new SchemList() : new SchemVector();
      for (let i = 0; i < ast.length; i++) {
        evaluatedAST[i] = await this.evalSchem(ast[i], env);
      }

      return evaluatedAST;
    } else if ( isSchemLazyVector(ast)) {

      const evaluatedAST = new SchemVector();
      for (let i = 0; i < ast.count(); i++) {
        evaluatedAST[i] = await this.evalSchem((await ast.nth(i) as AnySchemType), env);
      }

      return evaluatedAST;
    } else if ( isSchemMap(ast)) {
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
  async evalSchem(ast: AnySchemType, env: Env = this.replEnv): Promise<AnySchemType> {
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
      if (!(isSchemList(ast))) {
        return await this.evalAST(ast, env);
      }

      ast = await this.macroExpand(ast, env);

      if (!(isSchemList(ast))) {
        return this.evalAST(ast, env);
      }

      if (isSchemList(ast)) {
        if (ast.length === 0) {
          return ast;
        } else {
          const first: AnySchemType = ast[0];

          // SchemSymbols can indicate special forms
          if (isSchemSymbol(first)) {
            switch (first.name) {
              /** (def symbol value)
               * Binds a value to a symbol in the current environment
               */
              case 'def':
                if (isSchemSymbol(ast[1])) {
                  return env.set(ast[1] as SchemSymbol, await this.evalSchem(ast[2], env));
                } else {
                  throw `first argument of 'def' must be a symbol`;
                }

              /** (defmacro name fn)
               * Binds a function to a symbol and sets its isMacro flag.
               */
              case 'defmacro':
                const [, sym, body] = ast;
                if (!isSchemSymbol(sym)) {
                  throw new Error(`First argument of defmacro must be a symbol!`);
                }
                if (!isSchemList(body)) {
                  throw new Error(`Second argument of defmacro must be a list!`);
                }

                const macroFunction = this.fn(env, body);
                macroFunction.isMacro = true;
                return env.set(sym, macroFunction);

              /** (defcontext example: {:tabQuery {:url "*example.com*"})
               * Binds a context definition to a context symbol
              */
              case 'defcontext': {
                const [, contextSymbol, contextDefinitionMap] = ast;

                if (isSchemContextSymbol(contextSymbol) && isSchemMap(contextDefinitionMap)) {
                  env.set(contextSymbol, SchemContextDefinition.fromSchemMap(contextDefinitionMap, this));
                }

                return SchemBoolean.true;
              }
              /** (let (symbol1 value1 symbol2 value2 ...) expression) or (let [symbol1 value1 symbol2 value2 ...] expression)
               * Creates a new child environment and binds a list of symbols and values, the following expression is evaluated in that environment
               * Supports basic sequential destructuring
               */
              case 'let':
                const bindings = ast[1];

                if (!(isSequential(bindings))) {
                  throw new Error(`first argument of let has to be a list`);
                }
                else if (bindings.length % 2 > 0) {
                  throw new Error(`binding list contains uneven number of elements`);
                }

                // separate the alternating name and value elements of bindings
                let names = [], values = [];
                for (let i = 0; i < bindings.length; i += 2) {
                  names.push(bindings[i]);
                  values.push(bindings[i + 1]);
                }

                const childEnv = new Env(env);
                await childEnv.bind(new SchemVector(...names), new SchemVector(...values), this);

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
                if (( isSchemBoolean(condition) && condition === SchemBoolean.false) ||  isSchemNil(condition)) {
                  ast = (typeof ast[3] === 'undefined') ? SchemNil.instance : ast[3];
                  continue;
                } else {
                  ast = ast[2];
                  continue fromTheTop;
                }

              /** (fn name? docstring? [parameters] (functionBody)
               *  Defines a new function in the current environment. When it's called, the function body gets executed in a new child environmet.
               *  In this child environmet, the symbols provided in params are bound to the values provided as arguments by the caller.
              */
              case 'fn':
                return this.fn(env, ast);

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
                const expandedList = await this.macroExpandAll(ast, env);
                if (isSchemList(expandedList) && expandedList.length === 2) {
                  return expandedList[1];
                } else {
                  throw new Error(`Something went wrong during macro expansion!`);
                }

              /** (set-interpreter-options map) changes interpreter settings
               *  e.g.: (set-interpreter-options {"logArepInput" true "pauseEvaluation" false}) */
              case 'set-interpreter-options':
                const options = await this.evalAST(ast[1], env);
                if (!( isSchemMap(options))) throw `(set-interpreter-options options) options must be a map`;

                options.forEach((key, value) => {
                  if ( isSchemString(key) &&  isSchemBoolean(value) && key.valueOf() in this.debug) {
                    (this.debug as any)[key.valueOf()] = value.valueOf();  // typecost is necessary, because the debug options literal lacks a string indexer – but we allready checked if the object has that key, so it's all good
                  }
                  return void 0;
                });
                return SchemNil.instance;

            }
            /** (window.example a b &c)
             * If a symbol contains dots, treat it as a javascrip procedure that should be invoked with the provided arguments.
             * (arguments are evaluated before being passed to the procedure)
            */
            if (SchemSymbol.refersToJavascriptObject(first)) {
              const [, ...rest] = ast;
              let evaluatedArguments: any = await this.evalAST(new SchemVector(...rest), env);
              ast = await invokeJsProcedure(first.name, evaluatedArguments);
              continue fromTheTop;
            }
          } else if (isSchemContextSymbol(first)) {
            if (this.contextManager != null) {
              const contextDef = env.getContextSymbol(first);
              const contextIds = await this.contextManager.prepareContexts(contextDef);

              /** (contextSymbol: (form))
              * execute (form) in any context matching the definition bound to contextSymbol:
              */
              let form = ast[1];
              if (isSchemList(form)) {
                // if the whole form is quasiquoted, evaluate it in this context to resolve any unquoted parts, then evaluate that it in the foreign context
                if (isSchemSymbol(form[0]) && (form[0] as SchemSymbol).name === 'quasiquote') {
                  form = await this.evalSchem(form, env);
                }
                let resultsAndErrors = await this.contextManager.arepInContexts(contextIds, await pr_str(form), ast[2]);
                return new SchemList(...resultsAndErrors.map(resultOrError => {
                  if ('result' in resultOrError) {
                    return readStr(resultOrError.result);
                  } else {
                    const m = new SchemMap();
                    m.set( SchemKeyword.from('error'), new SchemString(resultOrError.error));
                    return m;
                  }
                }));
                // or do tco? -> "continue fromTheTop;"

              /** (contextSymbol:js.symbol args)
               * invoke a js function in its contexts
              */
              } else if (isSchemSymbol(ast[1])) {
                const sym = ast[1] as SchemSymbol;
                let results;
                if (SchemSymbol.refersToJavascriptObject(sym)) {
                  // no need to inject an interpreter if all you want to do is invoke a js function
                  const v = new SchemVector(...ast.slice(2));
                  const args = await this.evalAST(v, env);
                  results = await this.contextManager.invokeJsProcedure(contextIds, sym.name, args);
                  return new SchemList(...results.map(r => readStr(r)));
                } else {
                  throw new Error(`Syntax error. Can't directly invoke a function in a different context. You probably forgot some parens. Try (context:(function args)) instead of (context:function args)`);
                  // TODO: golem.injectedProcedures actually can be invoked directly. Implement lightweight invoking mechanism.
                }
              } else {
                throw new Error(`Syntax error. A context symbol must be followed by either a list or a qualified javacript name.`);
              }

            } else {
              throw new Error(`defcontext can only be called by an interpreter instance that is running in a privileged javascript context (such as the event page)`);
            }
          }

          // If first didn't match any of the above, treat it as a function: evaluate all list elements and call the first element using the others as arguments
          const [f, ...args] = await this.evalAST(ast, env) as SchemList;

          if (isCallable(f)) {
            if (isSchemFunction(f)) {
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
                env = new Env(f.fnContext.env);
                env.bind(f.fnContext.params, new SchemList(...args));
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
          // Symbols that are bound to anther symbol that contains dots are treated like an alias to a javacript procedure call.
          // (let [x 'window.example] (x args)) <- invokes window.example with args
          } else if (isSchemSymbol(f) && SchemSymbol.refersToJavascriptObject(f)) {
            return await invokeJsProcedure(f.name, args);
          // Invoke JSReferences if they 'point' to a js function
          } else if (isSchemJSReference(f) && f.typeof() === 'function') {
            f.invoke(...args);
          } else {
            console.log(first);
            throw new Error(`Invalid form: first element "${first}" is not callable`);
          }
        }
      }

      return SchemNil.instance;
    }
  }

  private fn(env: Env, ast: SchemList) {
    let name, docstring, params, fnBody;

      if (isSchemSymbol(ast[1])) {
        if (isSchemString(ast[2])) {
          [, name, docstring , params, fnBody] = ast;
          docstring = (docstring as SchemString).valueOf();
        } else {
          [, name, params, fnBody] = ast;
        }
        name = (name as SchemSymbol).name;
      } else if (isSchemString(ast[1])) {
        [, docstring, params, fnBody] = ast;
        docstring = (docstring as SchemString).valueOf();
      } else {
        [, params, fnBody] = ast;
      }

      if (!(isSchemList(params) || isSchemVector(params))) {
        throw `expected a list or vector of parameters`;
      }

      try {
        let metadata: SchemMetadata = {};
        if (name) metadata.name = name;
        if (docstring) metadata.docstring = docstring;
        return SchemFunction.fromSchemWithContext(this, env, params, fnBody, metadata);

      } catch (error) {
        throw `binds list for new environments must only contain symbols`;
      }
  }

  evalQuasiquote(ast: AnySchemType): AnySchemType {
    if (isSequential(ast)) {
      if (ast.length === 0) {
        // ast is an empty list -> quote it
        return new SchemList(SchemSymbol.from('quote'), ast);
      }

      const nonEmptyList = ast;
      if (isSchemSymbol(nonEmptyList[0]) && (nonEmptyList[0] as SchemSymbol).name === 'unquote') {
        // ast looks like: (unquote x) -> return just x, so it's going to be evaluated
        return nonEmptyList[1];
      }

      const [, ...secondTroughLastElements] = nonEmptyList;

      if (isSequential(nonEmptyList[0])) {
        const innerList = (nonEmptyList[0] as SchemList);
        if (isSchemSymbol(innerList[0]) && (innerList[0] as SchemSymbol).name === 'splice-unquote') {
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

  async readEval(expression: string): Promise<AnySchemType> {
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
  isMacroCall(ast: AnySchemType, env: Env) {
    if (isSchemList(ast) && isSchemSymbol(ast[0])) {
      try {
        const val = env.get(ast[0] as SchemSymbol);
        return (isSchemFunction(val) && val.isMacro);
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
  async macroExpand(ast: AnySchemType, env: Env) {
    while (this.isMacroCall(ast, env)) {
      const [symbol, ...rest] = ast as SchemList;
      // the following typecasts are safe because isMacroCall returned true
      const macroFunction = env.get(symbol as SchemSymbol) as SchemFunction;
      ast = await macroFunction.f(...rest);
    }
    return ast;
  }

  /** Recursively expands macro all functions in an abstract syntax tree */
  async macroExpandAll(ast: AnySchemType, env: Env): Promise<AnySchemType> {
    if (isSchemList(ast)) {
      return new SchemList(...await Promise.all<AnySchemType>(
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
// TODO: use isCollection, first and next instead of for loop
export function filterRecursively(ast: AnySchemType, predicate: (element: AnySchemType) => boolean): AnySchemType[] {
  let results = Array<AnySchemType>();
  let currentElement: AnySchemType;
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