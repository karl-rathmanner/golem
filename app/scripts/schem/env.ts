import { readStr } from './reader';
import { Schem } from './schem';
import { isSchemContextSymbol, isSchemSymbol } from './typeGuards';
import { SchemContextDefinition, SchemContextSymbol, SchemFunction, SchemList, SchemSymbol, SchemType } from './types';

/** This allows concevient initialization of environments when using Env.addMap()
 *
 * @example
 * {
 *  'pi': new SchemNumber(3.14159265359),
 *  'sqr': (d: Schemnumber) => d.valueOf() * d.valueOf(),
 * }
 */
export abstract class EnvSetupMap {
  // I'm allowing the map to have undefined entries to defining EnvSetupMaps that contain a subset of a string literal type. e.g.:
  // const editorEnv: {[symbolName in EventPageActionName]?: SchemType} = {...}
  // If the above index signature wasn't nullable, only maps containing keys for *all* string literals would be accepted.
  [symbol: string]: any | undefined
}

/**  Environments map symbols to values
 * @description
 * Environments can be initialized in TS (e.g. set('a', new SchemNumber(42)) or modified at runtime (e.g. "(def a 42)")
 * When a symbol can't be found in an Env, its outer Envs are searched recursively. This means, 'lokal' symbols can hide outer symbols.
 */
export class Env {
  private symbolValueMap = new Map<symbol, SchemType>();
  private contextSymbolMap = new Map<string, SchemContextDefinition>();
  name: string;

  constructor(public outer?: Env, binds: SchemSymbol[] = [], exprs: SchemType[] = [], logDebugMessages = false) {
    // Generate a human readable name to make debugging easier
    this.name = String.fromCharCode(65 + Math.random() * 24) + String.fromCharCode(65 + Math.random() * 24) + String.fromCharCode(65 + Math.random() * 24);

    if (logDebugMessages) {
      console.log(`A new env named ${this.name} was instantiated.`);
      console.log('It binds the following symbols: ' + binds.reduce((acc, current) => acc += (current as SchemSymbol).name + ' ', ''));
    }
    for (let i = 0; i < binds.length; i++) {
      if (logDebugMessages) console.log(`${binds[i].name} = ${exprs[i]}`);
      if (binds[i].getStringRepresentation() === '&') {
        // encountered a clojure style variadic function definition, turn the remaining expressions into a list and bind that to the symbol after '&'
        this.set(binds[i + 1], new SchemList(...exprs.slice(i)));
        return;
      }
      this.set(binds[i], exprs[i]);
    }
  }

  /** Binds a symbol to a value */
  set(key: SchemSymbol | string | SchemContextSymbol, value: SchemType | SchemContextDefinition, metadata?: SchemFunction['metadata']): SchemType {

    if ( isSchemContextSymbol(key)) {
      if (value instanceof SchemContextDefinition) {
        this.contextSymbolMap.set(key.name, value);
        return value;
      }
      throw new Error('Only context definitions may be bound to context symbols');
    }

    if (isSchemSymbol(key)) {
      key = key.name;
    }

    if (typeof value === 'function') {
      if (typeof metadata === 'undefined') {
        metadata = {name: key};
      } else {
        metadata.name = key;
      }

      this.symbolValueMap.set(Symbol.for(key), new SchemFunction(value, metadata));
    } else {
      this.symbolValueMap.set(Symbol.for(key), value);
    }
    return value;
  }

  /** Binds multiple symbols to their respective values
   * @param {boolean} [overwrite] If true, preexisting symbols will be overwritten
   */
  addMap(map: EnvSetupMap, overwrite: boolean = false) {
    for (const symbol in map) {
      if (!overwrite && this.symbolValueMap.has(Symbol.for(symbol))) {
        throw `Tried to modify existing symbol ${symbol} while overwrite flag is set to false.`;
      } else {
        const value = map[symbol];
        if (typeof value !== 'undefined') {
          this.set(SchemSymbol.from(symbol), value);
        }
      }
    }
  }

  /** Binds the value of an expression to a symbol (using itself as the environment for evaluation)*/
  async def(symbol: string, expression: string, interpreter: Schem) {
    interpreter.evalSchem(readStr(expression), this).then((ewald) => this.set(SchemSymbol.from(symbol), ewald));
  }

  /** Returns the environment cotaining a symbol or undefined if the symbol can't be found */
  find(sym: SchemSymbol | SchemContextSymbol): Env | undefined {
    if (isSchemSymbol(sym) && this.symbolValueMap.has(Symbol.for(sym.name)) ||
         isSchemContextSymbol(sym) && this.contextSymbolMap.has(sym.name)) {
      return this;
    } else {
      if (this.outer) {
        return this.outer.find(sym);
      } else {
        return void 0; // undefined can be overwritten and is considered unsafe
                       // https://stackoverflow.com/questions/19369023/should-i-be-using-void-0-or-undefined-in-javascript
      }
    }
  }

  /** Resolves a symbol to its value */
  get(sym: SchemSymbol | SchemContextSymbol): SchemType {

    const env = this.find(sym);
    if (!env) throw `${sym.name} not found`;

    if (isSchemSymbol(sym)) {
      return env.symbolValueMap.get(Symbol.for(sym.name))!;
    } else {
      return env.contextSymbolMap.get(sym.name)!;
    }

  }

  getContextSymbol(sym: SchemContextSymbol): SchemContextDefinition {
    return (this.get(sym) as SchemContextDefinition);
  }

  /** Returns all symbols defined in this and all outer environments */
  getSymbols(): Array<SchemSymbol> {

    let schemSymbols = Array.from(this.symbolValueMap.keys()).map(symbol => {
      return SchemSymbol.from(Symbol.keyFor(symbol)!);
    });

    if (this.outer) {
      return schemSymbols.concat(this.outer.getSymbols());
    } else {
      return schemSymbols;
    }
  }

}

