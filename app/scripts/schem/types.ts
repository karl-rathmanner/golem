import { Env } from './env';
import { Schem, schemToJs } from './schem';
import { Tabs } from 'webextension-polyfill-ts';
import { AvailableSchemContextFeatures } from '../contextManager';

// interfaces
export interface Callable {
  invoke: (...args: SchemType[]) => SchemType;
}

export interface Indexable {
  nth(index: number): SchemType;
}

export interface Reducible {
  reduce(callbackfn: (previousValue: any, currentValue: SchemType) => any, initialValue?: any): any;
}

export interface Sequable {
  /** returns the first element of the collecton or null */
  first(): SchemType | null;
  /** returns a collection containing the second to last elements of the collection - or null if there are no more elements*/
  next(): Sequable | null;
  /** returns a collection containing the second to last elements of the collection - or empty an collection if there are no more elements*/
  rest(): Sequable;
  /** returns a collection beginning with the passed element followed by the rest of this collection */
  cons(element: SchemType): Sequable;
}

export interface Countable {
  count: () => number;
}

export interface Metadatable {
  metadata?: SchemMetadata;
  // getMetadata(): SchemMap {}
}

// types

export type SchemType = SchemList | SchemVector| SchemMap | SchemNumber | SchemSymbol | SchemKeyword | SchemNil | SchemString | SchemRegExp | SchemFunction | SchemBoolean | SchemAtom | SchemContextSymbol | SchemContextInstance;
export type SchemMapKey = SchemSymbol | SchemKeyword | SchemString | SchemNumber;

export type SchemMetadata = {
  name?: string,
  sourceIndexStart?: number,
  sourceIndexEnd?: number,
  [index: string]: any,
};

// class - Schem Function

export class SchemFunction implements Callable, Metadatable {
  public isMacro = false;


  constructor(public f: Function,
    public metadata?: SchemMetadata,
    public fnContext?: {ast: SchemType, params: SchemSymbol[], env: Env}) {
    // bind a function's name to itself within its environment
    // this allows recursion even in 'anonymous' functions
    if (this.fnContext && metadata && metadata.name && metadata.name.length > 0) {
      this.fnContext.env.set(SchemSymbol.from(metadata.name), this);
    }
  }

  static fromSchemWithContext(that: Schem, env: Env, params: SchemSymbol[], functionBody: SchemType, metadata: SchemMetadata): SchemFunction {
    return new SchemFunction(async (...args: SchemType[]) => {

      return await that.evalSchem(functionBody, new Env(env, params, args));
    }, metadata, {ast: functionBody, params: params, env: env});
  }

  newEnv(args: SchemType[]): Env {
    if (this.fnContext) {
      return new Env(this.fnContext.env, this.fnContext.params, args);
    } else {
      return new Env(void 0, void 0, args);
    }
  }

  invoke(...args: SchemType[]) {
    return this.f(...args);
  }
}

// classes - Schem collection types

export class SchemList extends Array<SchemType> implements Reducible, Countable, Indexable, Metadatable, Sequable {
  static isCollection = true;
  metadata: SchemMetadata;

  /** Makes sure that all elements of the list are SchemSymbols and returns them in an array.*/
  public asArrayOfSymbols(): SchemSymbol[] {
    return this.map((e) => {
      if (!(e instanceof SchemSymbol)) throw `List contained an element of type ${e} where only symbols where expected`;
      return e;
    });
  }

  async amap(callbackfn: (value: SchemType, index: number, array: any[]) => any, thisArg?: any): Promise<any[]> {
    return Promise.all(this.map(callbackfn, thisArg));
  }

  count(): number {
    return this.length;
  }

  nth(index: number) {
    return this[index];
  }

  first(): SchemType | null {
    return (this[0] != null) ? this[0] : null;
  }

  next() {
    return (this.length > 1) ? new SchemList(...this.slice(1)) : null;
  }

  rest() {
    return (this.length > 1) ? new SchemList(...this.slice(1)) : new SchemList();
  }

  cons(element: SchemType) {
    return new SchemList(element, ...this);
  }


}

export class SchemVector extends Array<SchemType> implements Callable, Indexable, Countable, Metadatable, Sequable {
  static isCollection = true;
  metadata: SchemMetadata;

  count(): number {
    return this.length;
  }

  public asArrayOfSymbols(): SchemSymbol[] {
    return this.map((e) => {
      if (!(e instanceof SchemSymbol)) throw `Vector contained an element of type ${e} where only symbols where expected`;
      return e;
    });
  }

  async amap(callbackfn: (value: SchemType, index: number, array: any[]) => any, thisArg?: any): Promise<any[]> {
    return Promise.all(this.map(callbackfn, thisArg));
  }

  nth(index: number) {
    return this[index];
  }

  invoke(...args: SchemType[]) {
    const index = (args[0] instanceof SchemNumber) ? (args[0] as SchemNumber).valueOf() : NaN;
    if (Number.isInteger(index) && index >= 0 && index < this.length) {
      return this[index];
    }
    throw `index ${index} out of bounds`;
  }

  first(): SchemType | null {
    return (this[0] != null) ? this[0] : null;
  }

  next() {
    return (this.length > 1) ? new SchemVector(...this.slice(1)) : null;
  }

  rest() {
    return (this.length > 1) ? new SchemVector(...this.slice(1)) : new SchemVector();
  }

  cons(element: SchemType) {
    return new SchemVector(element, ...this);
  }
}

export class SchemMap implements Callable, Reducible, Countable, Metadatable {
  static isCollection = true;
  metadata: SchemMetadata;

  private nativeMap: Map<string, SchemType> = new Map<string, SchemType>();
  /** Returns an array of alternating key value pairs
   * @returns
   * [key: SchemSymbol, value:  SchemType, ...] */
  public flatten(): SchemList {
    return new SchemList(...Array.from(this.nativeMap.keys()).reduce(
      (acc: SchemType[], currentKey: string) => {
        acc.push(fromSchemMapKey(currentKey));
        acc.push(this.nativeMap.get(currentKey)!);
        return acc;
      }, []));
  }

  private turnIntoKeyString(key: SchemMapKey): string {
    let keyString: string;
    if (key instanceof SchemString) {
      keyString = 's'  + key.valueOf();
    } else if (key instanceof SchemNumber) {
      keyString = 'n'  + key.valueOf();
    } else if (key instanceof SchemKeyword) {
      keyString = 'k' + key.name;
    } else if (key instanceof SchemSymbol) {
      keyString = 'y' + key.name;
    } else {
      throw `invalid key type ${key}`;
    }
    return keyString;
  }


  // private getOriginalKeyObject

  set(key: SchemMapKey, value: SchemType ): void {
    this.nativeMap.set(this.turnIntoKeyString(key), value);
  }

  get(key: SchemMapKey, defaultValue?: SchemType): SchemType {
    let v = this.nativeMap.get(this.turnIntoKeyString(key));
    if (v) return v;
    if (defaultValue) return defaultValue;
    return SchemNil.instance;
  }

  has(key: SchemMapKey): SchemType {
    return this.nativeMap.has(this.turnIntoKeyString(key));
  }

  getValueForSymbol(name: string) {
    return this.get(SchemSymbol.from(name));
  }

  getValueForKeyword(name: string) {
    return this.get(SchemKeyword.from(name));
  }

  /** Returns a new map from the results of passing this map's values through the callback function (keys are not changed)*/
  map(callbackFn: (value: SchemType, key?: SchemMapKey) => SchemType): SchemMap {
    let newMap = new SchemMap();

    this.nativeMap.forEach((value, key) => {
      newMap.set(fromSchemMapKey(key), callbackFn(value));
    });

    return newMap;
  }

  forEach(callbackFn: (key: SchemMapKey, value: SchemType) => void) {
    this.nativeMap.forEach((value: SchemType, key: string) => {
      callbackFn(fromSchemMapKey(key), value);
    });
  }

  count(): number {
    return this.nativeMap.keys.length;
  }

  /* TODO: implement amap?
  async amap(callbackFn: (value: SchemType , index: number, arrayOfValues: any[]) => any): Promise<any[]> {
  }*/

  reduce(callbackfn: (previousValue: number, currentValue: SchemType) => number, initialValue: number = 0): any {
    return this.flatten().reduce(callbackfn, initialValue);
  }

  invoke(...args: SchemType[]) {
    let key = args[0];
    if (isValidKeyType(key)) {
      return this.get(key, args[1]);
    } else {
      throw `type of ${key} is not of a key for maps`;
    }
  }
}
export class LazyVector implements Countable, Indexable {
  static isCollection = true;

  private cachedValues: Map<number, SchemType>;

  constructor(private producer: SchemFunction, public maximumSize = Infinity) {
    this.cachedValues = new Map<number, SchemType>();
  }

  async nth(index: number): Promise<SchemType> {
    if (!this.cachedValues.has(index)) {
      this.cachedValues.set(index,
        await this.producer.invoke(new SchemNumber(index))
      );
    }
    return this.cachedValues.get(index)!;
  }

  async realizeSubvec(start: number, end: number = this.maximumSize): Promise<SchemVector> {
    if (typeof end === 'undefined' && this.maximumSize === Infinity) {
      throw `can't realize an infinite vector`;
    }
    let realizedContents: SchemType[] = new Array<SchemType>();
    for (let i = start; i < this.maximumSize && i < end; i++) {
      const value = await this.nth(i);
      realizedContents.push(value);
    }
    return new SchemVector(...realizedContents);
  }

  map(callbackfn: (value: SchemType, index: number, array: any[]) => any, thisArg?: any): any[] {
    let realizedContents: SchemType[] = new Array<SchemType>();
    for (let i = 0; i < this.maximumSize; i++) {
      if (thisArg) {
        realizedContents.push(callbackfn.apply(thisArg, [this.nth(i), i, realizedContents]));
      } else {
        const realizedValue = this.nth(i);
        realizedContents[i] = (callbackfn(realizedValue, i, realizedContents));
      }
    }
    return realizedContents;
  }

  count() {
    return this.maximumSize;
  }
}

/// classes - Schem value types

export class SchemNil {
  static instance = new SchemNil();
  private constructor() {}
}

export class SchemBoolean extends Boolean {
  static false = new SchemBoolean(false);
  static true = new SchemBoolean(true);

  static fromBoolean(v: boolean) {
    return v ? SchemBoolean.true : SchemBoolean.false;
  }

  private constructor(v: boolean) {
    super(v);
  }
}

export class SchemNumber extends Number implements Callable {
  invoke(...args: SchemType[]) {
    const i = this.valueOf();
    const sequential = args[0];
    if (sequential instanceof SchemList || sequential instanceof SchemVector) {
      if (i < 0 || i >= sequential.length) {
        throw `index ${i} out of bounds!`;
      }
      return sequential[this.valueOf()];
    } else {
      throw `integers can only be invoked with lists or vectors as parameters`;
    }
  }

  getStringRepresentation(): string {
    return this.valueOf().toString();
  }
}

export class SchemString extends String {

  // can't hide toString()
  getStringRepresentation(): string {
    return this.valueOf();
  }
}

export class SchemRegExp extends RegExp {
  getStringRepresentation() {
    if (this.flags.length > 0) {
      return `#"(?${this.flags})${this.source}"`;
    }
    return `#"${this.source}"`;
  }
}

// This implementation is naïve and the symbol registry has no purpose as of yet.
// TODO: check if the overhead is necessary
class SymbolicType {
  static symbolRegistry: Set<string>;

  protected constructor(public name: string) {
  }

  static from(name: string | SchemString) {
    if (name instanceof SchemString) {
      name = name.valueOf();
    }

    this.symbolRegistry.add(name);
    return new SymbolicType(name);
  }

  /** Always returns the plain name of a symbolic type */
  valueOf() {
    return this.name;
  }

  /** Might return something other than just the name in derived classes (such as ":name" for keywords) */
  getStringRepresentation() {
    return this.name;
  }
}

export class SchemSymbol extends SymbolicType implements Metadatable {
  metadata: SchemMetadata;

  static refersToJavascriptObject(sym: SchemSymbol): boolean {
    return (sym.name.indexOf('.') !== -1);
  }

  // static registeredSymbols: Map<symbol, SchemSymbol> = new Map<symbol, SchemSymbol>();

  private constructor(name: string) {
    super(name);
  }

  static from(name: string | SchemString) {
    if (name instanceof SchemString) {
      name = name.valueOf();
    }

    if (name.length === 0) {
      throw new Error(`Zero-lenght symbols are not allowed.`);
    }

    if (name.length > 1 && /[:/]/.test(name)) {
      throw new Error(`Symbols mustn't contain the characters ':' or '/'. Those are reserved!`);
    }

    return new SchemSymbol(name);
  }
}


export class SchemKeyword extends SymbolicType implements Callable {
  static registeredSymbols: Map<symbol, SchemKeyword> = new Map<symbol, SchemKeyword>();

  static from(name: string | SchemString): SchemKeyword {
    if (name instanceof SchemString) {
      name = name.valueOf();
    }

    if (name.length === 0) {
      throw new Error(`Zero-lenght keywords are not allowed. (':' by itself looks far too lonely)`);
    }

    if (/[:/]/.test(name)) {
      throw new Error(`Keywords' names mustn't contain the characters ':' or '/'. (Yes, keywords begin with ':' but the name is the part after the colon.)`);
    }

    return new SchemKeyword(name);
  }

  /** Returns the name of the keyword prefixed with ":" */
  getStringRepresentation() {
    return ':' + this.name;
  }

  /** Returns the value that is associated with this keyword in the provided collection */
  invoke(...args: SchemType[]) {
    if (args.length === 0) {
      throw `Tried to invoke a keywords without passing a collection. Did you accidentally put it in the head position of a form that wasn't supposed to be evaluated?`;
    }
    if (args[0] instanceof SchemMap) {
      return (args[0] as SchemMap).get(this, args[1]);
    } else {
      throw 'First argument to keyword lookup must be a map';
    }
  }
}

export class SchemContextSymbol extends SymbolicType {
  static from(name: string | SchemString): SchemContextSymbol {
    if (name instanceof SchemString) {
      name = name.valueOf();
    }

    if (/[:/]/.test(name)) {
      throw new Error(`A context name mustn't contain the characters ':' or '/'. (The name is the part before the colon at the end of a context symbol.)`);
    }

    return new SchemContextSymbol(name);
  }

  /** Returns the name of the context suffixed with ":" */
  getStringRepresentation() {
    return this.name + ':';
  }
}

/** Serializable description of a SchemContext. A definition allows the event page to instatiate and setup a new context that fits the description. Definitions also allow Schem scripts to reason about what a given context might be able to do.
 * In theory.
 */
export class SchemContextDefinition {
  frameId?: number;
  features?: AvailableSchemContextFeatures[];
  runAt?: 'document_start' | 'document_end' | 'document_idle';

  constructor(public tabQuery: Tabs.QueryQueryInfoType, public lifetime: 'inject-once' | 'persist-navigation', features?: AvailableSchemContextFeatures[]) {
    if (features != null) {
      this.features = features;
    }
  }

  static fromSchemMap(initializationMap: SchemMap): SchemContextDefinition {
    const jso = schemToJs(initializationMap, {keySerialization: 'noPrefix'});
    if (jso.tabQuery != null) {
      return new SchemContextDefinition(jso.tabQuery, 'inject-once', jso.features);
    }
    throw new Error(`missing value for :tabQuery`);
  }
}

/** These can't be passed around as messages. Contains... callbacks, information about what was already injected and stuff that's necessary for context persistence? I think only the event page will need to handle instances of contexts. */
export class SchemContextInstance {
  baseContentScriptIsLoaded: boolean = false;
  activeFeatures: Set<SchemContextDefinition['features']>;

  // TODO: add properties describing the context's capabilities - available procedures, atoms, hasInterpreter etc.
  constructor(public id: number, public tabId: number, public windowId: number, public definition: SchemContextDefinition, public frameId?: number) {
  }

  /** Called after context injection. */
  public onLoad?: Function;
  /** Called before Page unload. */
  public onUnload?: Function;
  /** Called when a context is explicitly destroyed. */
  public onDestroy?: Function;

  public destroy() {
    if (this.onDestroy != null) {
      this.onDestroy();
    }
  }
}

/// classes - other Schem types

export class SchemAtom {
  constructor(public value: SchemType) {
  }
}

/// type guards

export function isSequential(object: SchemType): object is SchemList | SchemVector {
  return (object instanceof SchemList || object instanceof SchemVector);
}

export function isSchemType(o: any): o is SchemType {
  return (o instanceof SchemList ||
          o instanceof SchemVector ||
          o instanceof SchemMap ||
          o instanceof SchemNumber ||
          o instanceof SchemSymbol ||
          o instanceof SchemContextSymbol ||
          o instanceof SchemKeyword ||
          o instanceof SchemNil ||
          o instanceof SchemString ||
          o instanceof SchemRegExp ||
          o instanceof SchemFunction ||
          o instanceof SchemBoolean ||
          o instanceof SchemAtom);
}

export function isSchemCollection(o: any): boolean {
  return (o instanceof SchemList ||
          o instanceof SchemVector ||
          o instanceof SchemMap ||
          o instanceof LazyVector);
}

export function isCallable(o: any): o is Callable {
  return (typeof o.invoke === 'function');
}

export function isValidKeyType(o: any): o is SchemMapKey {
  return (o instanceof SchemKeyword ||
          o instanceof SchemNumber ||
          o instanceof SchemString);
}

export function isSequable(o: any): o is Sequable {
  return (typeof o.first === 'function' &&
          typeof o.next === 'function' &&
          typeof o.rest === 'function' &&
          typeof o.cons === 'function');
}

// type conversion

export function toSchemMapKey(key: SchemMapKey): string {
  if (key instanceof SchemString) {
    return 's'  + key.valueOf();
  } else if (key instanceof SchemNumber) {
    return 'n'  + key.valueOf();
  } else if (key instanceof SchemKeyword) {
    return 'k' + key.name;
  } else if (key instanceof SchemSymbol) {
    return 'y' + key.name;
  } else {
    throw `invalid key type ${key}`;
  }
}

export function fromSchemMapKey(key: string): SchemMapKey {
  switch (key[0]) {
    case 's': return new SchemString(key.slice(1));
    case 'n': return new SchemNumber(parseFloat(key.slice(1)));
    case 'k': return SchemKeyword.from(key.slice(1));
    case 'y': return SchemSymbol.from(key.slice(1));
  }
  throw `key "${key}" starts with unknown type prefix`;
}