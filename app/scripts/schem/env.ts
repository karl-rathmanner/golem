import { readStr } from './reader';
import { Schem } from './schem';
import { isSchemContextSymbol, isSchemSymbol, isSchemVector, isIndexable } from './typeGuards';
import { SchemContextDefinition, SchemContextSymbol, SchemFunction, SchemList, SchemSymbol, AnySchemType, SchemVector, SchemNil } from './types';

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
  private symbolValueMap = new Map<symbol, AnySchemType>();
  private contextSymbolMap = new Map<string, SchemContextDefinition>();
  name: string;

  constructor(public outer?: Env, logDebugMessages = false) {
    // Generate a human readable name to make debugging easier
    this.name = String.fromCharCode(65 + Math.random() * 24) + String.fromCharCode(65 + Math.random() * 24) + String.fromCharCode(65 + Math.random() * 24);
    if (logDebugMessages) {
      console.log(`A new env named ${this.name} was instantiated.`);
    }
  }
  
  public async bind(names: SchemVector | SchemList, expressions: SchemVector | SchemList, interpreter?: Schem, logDebugMessages = false) {
    for (let i = 0; i < names.length; i++) {
      let target = names[i];
      const value = expressions[i];

      if (isSchemSymbol(target)) {
        if (target.getStringRepresentation() === '&') {
          // encountered a clojure style variadic function definition, turn the remaining expressions into a list and bind that to the symbol after '&'
          target = names[i + 1];

          if (!isSchemSymbol(target)) {
            throw new Error(`An "&" in a bindings sequence must be followed by a symbol!`);
          }

          if (logDebugMessages) console.log(`${target.name} = ${expressions.slice(i)}`);
          
          if (interpreter == null) {
            this.set(target, new SchemList(...expressions.slice(i)));
          } else {
            const evaluatedRest = await Promise.all(expressions.slice(i).map(element => interpreter.evalSchem(element, this)));
            this.set(target, new SchemList(...evaluatedRest));
          }
          return;
        }

        if (logDebugMessages) console.log(`${target.name} = ${value}`);
        // Bind value to a symbol
        if (interpreter == null) {
          this.set(target as SchemSymbol, value);
        } else {
          this.set(target as SchemSymbol, await interpreter.evalSchem(value, this));
        }
      } else if (isSchemVector(target)) {

        // Sequential Destructuring
        if (target.count() < 1) {
          throw new Error(`Destructuring target vector can't be empty.`);
        }
        const seqDestructure = async (targetVector: SchemVector, sourceData: AnySchemType) => {
          if (!isIndexable(sourceData)) {
            throw new Error(`Desctructuring source must be indexable.`);
          }
          for (let i = 0; i < targetVector.length; i++) {
            let sourceElement = await sourceData.nth(i);
            // Default to Nil if no value could be found in the source data structure
            // e.g. when there are more elements in the target than in value
            if (sourceElement == null) {
              sourceElement = SchemNil.instance;
            }
            const targetElement = targetVector[i];
            if (isSchemVector(targetElement)) { // target vector is nested, go deeper
              await seqDestructure(targetElement, sourceElement);
            } else if (isSchemSymbol(targetElement)){
              // evaluate sourceElement and bind the resulting value
              if (logDebugMessages) console.log(`${targetElement.name} = ${sourceElement}`);
              
              if (interpreter == null) {
                this.set(targetElement as SchemSymbol, sourceElement);
              } else {
                this.set(targetElement as SchemSymbol, await interpreter.evalSchem(sourceElement, this));
              }
            } else {
              throw new Error(`A binds sequence contained something illegal: ${targetElement}`);
            }
          }
        };

        await seqDestructure(target, value);
      }
    }

    return true;
  }

  /** Binds a symbol to a value */
  // TODO: turn the type of value back to something like AnySchemType (once there's a 'wrapped js' SchemType)
  set(key: SchemSymbol | string | SchemContextSymbol, value: any, metadata?: SchemFunction['metadata']): AnySchemType {

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
  get(sym: SchemSymbol | SchemContextSymbol): AnySchemType {

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
  getSymbols(): Array<SchemSymbol | SchemContextSymbol> {

    let symbols: Array<SchemSymbol | SchemContextSymbol>;

    symbols = Array.from(this.symbolValueMap.keys()).map(symbol => {
      return SchemSymbol.from(Symbol.keyFor(symbol)!);
    });

    symbols.push(...Array.from(this.contextSymbolMap.keys()).map(symbol => {
      return SchemContextSymbol.from(symbol);
    }));

    if (this.outer) {
      return symbols.concat(this.outer.getSymbols());
    } else {
      return symbols;
    }
  }

}

