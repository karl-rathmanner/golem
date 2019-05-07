import { readStr } from './reader';
import { Schem } from './schem';
import { isSchemContextSymbol, isSchemSymbol, isSchemVector, isIndexable, isSchemList, isSchemMap, isSchemKeyword } from './typeGuards';
import { SchemContextDefinition, SchemContextSymbol, SchemFunction, SchemList, SchemSymbol, AnySchemType, SchemVector, SchemNil, SchemMap } from './types';

/** EnvSetupMaps allow convenient initialization of environments when using Env.addMap()
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
    [symbol: string]: Function | {f: Function, docstring?: string, paramstring?: string} | {value: any | undefined }
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

    public async bind(targetStructure: SchemVector | SchemList | SchemMap, sourceStructure: SchemVector | SchemList, interpreter?: Schem, logDebugMessages = false) {
        // If the target structure is empty, don't do anything.
        // This happens when you define a parameterless function: (fn [] x)
        if (targetStructure.count() === 0) return true;

        // This inner function is used to recursively destructure the sourceStructure's values into the targetStructure
        const desctructure = async (targetStructure: SchemVector | SchemList | SchemMap, sourceStructure: AnySchemType) => {

            // Evaluate 'right side' of a binding
            if (isSchemList(sourceStructure) && interpreter != null) {
                sourceStructure = await interpreter.evalSchem(sourceStructure, this);
            }

            if (isSchemVector(targetStructure) || isSchemList(targetStructure)) {
                // Sequential Destructuring
                if (targetStructure.count() < 1) {
                    throw new Error(`Destructuring target vector can't be empty.`);
                }

                if (!isIndexable(sourceStructure)) {
                    throw new Error(`The source structure of a bind using sequential destructuring must be indexable. (You probably have a vector on the "left side", but the "right side" doesn't implement "nth".)`);
                }

                for (let i = 0; i < targetStructure.length; i++) {
                    let sourceElement = await sourceStructure.nth(i) as AnySchemType;
                    // Default to Nil if no value could be found in the source data structure
                    // e.g. when there are more elements in the target than in value
                    if (sourceElement == null) {
                        sourceElement = SchemNil.instance;
                    }

                    let targetElement = targetStructure[i];

                    if (isSchemSymbol(targetElement)) {
                        if (targetElement.getStringRepresentation() === '&') {
                            // special case: encountered a clojure style variadic binding -> put the remaining source elements into a list and bind that to the symbol next to '&'
                            targetElement = targetStructure[i + 1];

                            if (!isSchemSymbol(targetElement)) {
                                throw new Error(`An "&" in a bindings sequence must be followed by a symbol!`);
                            }

                            if (logDebugMessages) console.log(`${targetElement.name} = (the last ${sourceStructure.length - i} elements of) ${sourceStructure}`);

                            // shove the remaining elements into a list, bind that list, call it a day
                            const newList = new SchemList();
                            for (let iRemaining = i; iRemaining < sourceStructure.length; iRemaining++) {
                                if (interpreter == null) {
                                    newList.push(await sourceStructure.nth(iRemaining));
                                } else {
                                    newList.push(await interpreter.evalSchem(await sourceStructure.nth(iRemaining), this));
                                }
                            }
                            this.set(targetElement, newList);
                            return;

                        } else {
                            // regular case: evaluate sourceElement and bind the resulting value
                            if (logDebugMessages) console.log(`${targetElement.name} = ${sourceElement}`);
                            this.set(targetElement as SchemSymbol, sourceElement);

                            if (interpreter == null) {
                                this.set(targetElement as SchemSymbol, sourceElement);
                            } else {
                                this.set(targetElement as SchemSymbol, await interpreter.evalSchem(sourceElement, this));
                            }
                        }

                    } else if (isSchemVector(targetElement) || isSchemList(targetElement) || isSchemMap(targetElement)) {
                        // target structure is nested, we must go deeper
                        await desctructure(targetElement, sourceElement);
                    } else {
                        throw new Error(`A binds sequence contained something illegal: ${targetElement}`);
                    }
                }

            } else if (isSchemMap(targetStructure)) {
                targetStructure.forEach((k, v) => {
                    if (!isSchemMap(sourceStructure)) {
                        throw new Error(`mapz plz!`);
                    }
                    if (isSchemSymbol(k)) {
                        if (isSchemKeyword(v)) {
                            this.set(k, sourceStructure.get(v));
                        } else {
                            throw new Error(`Tried to destructure into a map that had a symbol key associated with something other than a keyword value.`);
                        }
                    }
                });
            } else {
                throw new Error(`The target structure of a bind operation must be a vector, list or map`);
            }
        };

        // Call the inner function for its side effects
        await desctructure(targetStructure, sourceStructure);
        return true;
    }

    /** Binds a symbol to a value */
    // TODO: turn the type of value back to something like AnySchemType (once there's a 'wrapped js' SchemType)
    set(key: SchemSymbol | string | SchemContextSymbol, value: any, metadata?: SchemFunction['metadata']): AnySchemType {

        if (isSchemContextSymbol(key)) {
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
                metadata = { name: key };
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
                const schemSymbol = SchemSymbol.from(symbol);
                const value = map[symbol];
                if (typeof value === 'function') {
                    this.set(schemSymbol, new SchemFunction(value, {name: symbol, parameters: ['?'], docstring: 'Created from a js function.'}));
                } else if ('f' in value && typeof value.f === 'function') {
                    const docstr = value.docstring == null ? '' : value.docstring;
                    let params = ['?'];

                    // These are "necessary" when js maps are added to an environment (think: core.ts)
                    // You could generate these dynamically but I don't wanna think about all the edge cases.
                    if (value.paramstring != null && value.paramstring.length > 0) {
                        params = value.paramstring.split(' ');
                    }
                    this.set(schemSymbol, new SchemFunction(value.f, {name: symbol, docstring: docstr, parameters: params}));
                } else if (typeof value !== 'undefined') {
                    this.set(schemSymbol, value);
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

