import { Env } from './env';
import { Schem } from './schem';

// interfaces
export interface Callable {
  invoke: (...args: SchemType[]) => SchemType;
}

// types

export type SchemType = SchemList | SchemVector| SchemMap | SchemNumber | SchemSymbol | SchemKeyword | SchemNil | SchemString | SchemRegExp | SchemFunction | SchemBoolean | SchemAtom;
export type SchemMapKey = SchemSymbol | SchemKeyword | SchemString | SchemNumber;

export type SchemFunctionMetadata = {
  name?: string
};

// class - Schem Function

export class SchemFunction implements Callable {
  public isMacro = false;
  constructor(public f: Function,
    public metadata?: SchemFunctionMetadata,
    public fnContext?: {ast: SchemType, params: SchemSymbol[], env: Env}) {

    // bind a function's name to itself within its environment
    // this allows recursion even in 'anonymous' functions
    if (this.fnContext && metadata && metadata.name && metadata.name.length > 0) {
      this.fnContext.env.set(SchemSymbol.from(metadata.name), this);
    }
  }

  static fromSchemWithContext(that: Schem, env: Env, params: SchemSymbol[], functionBody: SchemType, metadata: SchemFunctionMetadata): SchemFunction {
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

export class SchemList extends Array<SchemType> {
  /** Makes sure that all elements of the list are SchemSymbols and returns them in an array.*/
  public asArrayOfSymbols(): SchemSymbol[] {
    return this.map((e) => {
      if (!(e instanceof SchemSymbol)) throw `List contained an element of type ${e} where only symbols where expected`;
      return e;
    });
  }
}

export class SchemVector extends Array<SchemType> implements Callable {
  public asArrayOfSymbols(): SchemSymbol[] {
    return this.map((e) => {
      if (!(e instanceof SchemSymbol)) throw `Vector contained an element of type ${e} where only symbols where expected`;
      return e;
    });
  }

  invoke(...args: SchemType[]) {
    const index = (args[0] instanceof SchemNumber) ? (args[0] as SchemNumber).valueOf() : NaN;
    if (Number.isInteger(index) && index >= 0 && index < this.length) {
      return this[index];
    }
    throw `index ${index} out of bounds`;
  }
}

export class SchemMap implements Callable {
  private nativeMap: Map<string, SchemType> = new Map<string, SchemType>();
  /** Returns an array of alternating key value pairs
   * @returns
   * [key: SchemSymbol, value:  SchemType, ...] */
  public flatten(): SchemType[] {
    return Array.from(this.nativeMap.keys()).reduce((acc: SchemType[], currentKey: string) => {
      acc.push(this.createSchemTypeForKeyString(currentKey));
      acc.push(this.nativeMap.get(currentKey)!);
      return acc;
    }, []);
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

  /** Changes each value in a SchemMap to the result of applying the provided collback function to it.
   * If the callback returns undefined, the Map's value is left as is.
   */
  map(callbackFn: (value: SchemType , key?: SchemMapKey) => SchemType | undefined) {
    const stringKeyArray = Array.from(this.nativeMap.keys());

    for (const stringKey of stringKeyArray) {
      const schemKey = this.createSchemTypeForKeyString(stringKey);

      if (!this.nativeMap.has(stringKey)) {
        throw `key '${stringKey} could not be found in map, even though a corresponding SchemKey existed`;
      }

      const newValue = callbackFn(this.nativeMap.get(stringKey)!, schemKey); // Since we checked for the key to exist in the map, the non-null assertion should be safe
      if (newValue) this.nativeMap.set(stringKey, newValue);                 // Don't change anything if the callback returned undefined
    }
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

export class SchemSymbol {
  isValidKeyType = true;
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

export function isValidKeyType(o: any): o is SchemMapKey {
  return o.isValidKExType;
}
