import { SchemFunction, SchemNumber, SchemSymbol, SchemType } from './types';
import { Schem } from './schem';
import { readStr } from './reader';

/** This allows concevient initialization of environments when using Env.addMap()
 *
 * @example
 * {
 *  'pi': new SchemNumber(3.14159265359),
 *  'sqr': (d: Schemnumber) => d.valueOf() * d.valueOf(),
 * }
 */
export abstract class EnvSetupMap {
  [symbol: string]: SchemType
}

/**  Environments map symbols to values
 * @description
 * Environments can be initialized in TS (e.g. set('a', new SchemNumber(42)) or modified at runtime (e.g. "(def a 42)")
 * When a symbol can't be found in an Env, its outer Envs are searched recursively. This means, 'lokal' symbols can hide outer symbols.
 */
export class Env {
  private symbolValueMap: Map<SchemSymbol, SchemType> = new Map<SchemSymbol, SchemType>();
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
      this.set(binds[i], exprs[i]);
    }
  }

  /** Binds a symbol to a value */
  set(key: SchemSymbol | string, value: SchemType, metadata?: SchemFunction['metadata']): SchemType {
    if (typeof key === 'string') key = SchemSymbol.from(key);

    if (typeof value === 'function') {
      if (typeof metadata === 'undefined') {
        metadata = {name: key.name};
      } else {
        metadata.name = key.name;
      }

      this.symbolValueMap.set(key, new SchemFunction(value, metadata));
    } else {
      this.symbolValueMap.set(key, value);
    }
    return value;
  }

  /** Binds multiple symbols to their respective values
   * @param {boolean} [overwrite] If true, preexisting symbols will be overwritten
   */
  addMap(map: EnvSetupMap, overwrite: boolean = false) {
    for (const symbol in map) {
      if (!overwrite && this.symbolValueMap.has(SchemSymbol.from(symbol))) {
        throw `Tried to modify existing symbol ${symbol} while overwrite flag is set to false.`;
      } else { // hope for the best that it's a SchemType
        // TODO: add a way of checking the union type Schemtype at runtime
        this.set(SchemSymbol.from(symbol), map[symbol]);
      }
    }
  }

  /** Binds the value of an expression to a symbol (using itself as the environment for evaluation)*/
  async def(symbol: string, expression: string, interpreter: Schem) {
    interpreter.evalSchem(readStr(expression), this).then((ewald) => this.set(SchemSymbol.from(symbol), ewald));
  }

  /** Returns the environment cotaining a symbol or undefined if the symbol can't be found */
  find(symbol: SchemSymbol): Env | undefined {
    if (this.symbolValueMap.has(symbol)) {
      return this;
    } else {
      if (this.outer) {
        return this.outer.find(symbol);
      } else {
        return void 0; // undefined can be overwritten and is considered unsafe
                       // https://stackoverflow.com/questions/19369023/should-i-be-using-void-0-or-undefined-in-javascript
      }
    }
  }

  /** Resolves a symbol to its value */
  get(key: SchemSymbol): SchemType {
    const env = this.find(key);
    if (!env) throw `${key.name} not found`;
    return env.symbolValueMap.get(key)!;
  }
}

