import { Env } from './env';
import { Schem } from './schem';

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
  first(): SchemType;
  next(): Sequable;
  rest(): Sequable;
  cons(): Sequable;
}

export interface Countable {
  count: () => number;
}

export interface Metadatable {
  metadata?: SchemMetadata;
  // getMetadata(): SchemMap {}
}

// types

export type SchemType = SchemList | SchemVector| SchemMap | SchemNumber | SchemSymbol | SchemKeyword | SchemNil | SchemString | SchemRegExp | SchemFunction | SchemBoolean | SchemAtom;
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

export class SchemList extends Array<SchemType> implements Reducible, Countable, Indexable, Metadatable {
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
}

export class SchemVector extends Array<SchemType> implements Callable, Indexable, Countable, Metadatable {
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
        acc.push(this.createSchemTypeForKeyString(currentKey));
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

  private createSchemTypeForKeyString(keyString: string): SchemMapKey {
    switch (keyString[0]) {
      case 's': return new SchemString(keyString.slice(1));
      case 'n': return new SchemNumber(parseFloat(keyString.slice(1)));
      case 'k': return SchemKeyword.from(keyString.slice(1));
      case 'y': return SchemSymbol.from(keyString.slice(1));
    }
    throw `unexpected keyString "${keyString}" appeared in Map ${this}`;
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
      newMap.set(this.createSchemTypeForKeyString(key), callbackFn(value));
    });

    return newMap;
  }

  forEach(callbackFn: (value: SchemType, key: SchemMapKey) => void) {
    this.nativeMap.forEach((value: SchemType, key: string) => {
      callbackFn(value, this.createSchemTypeForKeyString(key));
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
    if ('isValidKeyType' in key) {
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
  isValidKeyType = true;

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
}

export class SchemString extends String {
  isValidKeyType = true;
  stringValueOf = this.valueOf;
}

export class SchemRegExp extends RegExp {
  stringValueOf() {
    if (this.flags.length > 0) {
      return `#"(?${this.flags})${this.source}"`;
    }
    return `#"${this.source}"`;
  }
}

export class SchemSymbol implements Metadatable {
  static isValidKeyType = true;
  metadata: SchemMetadata;

  stringValueOf() {
    return this.name;
  }

  static registeredSymbols: Map<symbol, SchemSymbol> = new Map<symbol, SchemSymbol>();

  static from(name: string | SchemString): SchemSymbol {
    // Creates symbols using the global symbol registry, so the same name maps to the same symbol
    const jsSym: symbol = Symbol.for(name.valueOf());

    if (this.registeredSymbols.has(jsSym)) {
      return this.registeredSymbols.get(jsSym)!;
    } else {
      const newSchemSymbol = new SchemSymbol(name.valueOf());
      this.registeredSymbols.set(jsSym, newSchemSymbol);
      return newSchemSymbol;
    }
  }

  private constructor(public name: string) {
  }
}

export class SchemKeyword implements Callable {
  isValidKeyType = true;
  stringValueOf() {
    return ':' + this.name;
  }

  static registeredSymbols: Map<symbol, SchemKeyword> = new Map<symbol, SchemKeyword>();

  static from(name: string | SchemString): SchemKeyword {
    // Creates symbols using the global symbol registry, so the same name maps to the same symbol
    const jsSym: symbol = Symbol.for(name.valueOf());

    if (this.registeredSymbols.has(jsSym)) {
      return this.registeredSymbols.get(jsSym)!;
    } else {
      const newSchemSymbol = new SchemKeyword(name.valueOf());
      this.registeredSymbols.set(jsSym, newSchemSymbol);
      return newSchemSymbol;
    }
  }

  private constructor(public name: string) {
  }

  invoke(...args: SchemType[]) {
    if (args.length === 0) {
      throw `Keywords aren't functions.`;
    }
    if (args[0] instanceof SchemMap) {
      return (args[0] as SchemMap).get(this, args[1]);
    } else {
      throw 'First argument to keyword lookup must be a map';
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

export function isSchemType(object: any): object is SchemType {
  return (object instanceof SchemList ||
          object instanceof SchemVector ||
          object instanceof SchemMap ||
          object instanceof SchemNumber ||
          object instanceof SchemSymbol ||
          object instanceof SchemKeyword ||
          object instanceof SchemNil ||
          object instanceof SchemString ||
          object instanceof SchemRegExp ||
          object instanceof SchemFunction ||
          object instanceof SchemBoolean ||
          object instanceof SchemAtom);
}

export function isCallable(o: any): o is Callable {
  return (typeof o.invoke === 'function');
}

export function isValidKeyType(object: any): object is SchemMapKey {
  return (object instanceof SchemKeyword ||
          object instanceof SchemNumber ||
          object instanceof SchemString);
}

export function isSequable(o: any) {
  return (typeof o.first === 'function' &&
          typeof o.next === 'function' &&
          typeof o.rest === 'function' &&
          typeof o.cons === 'function');
}
