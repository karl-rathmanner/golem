import { Env } from './env';
import { Schem } from './schem';

export type SchemType = SchemList | SchemVector| SchemNumber | SchemSymbol | SchemKeyword | SchemNil | SchemString | SchemFunction | SchemBoolean | SchemAtom;

export function isSequential(object: SchemType): object is SchemList | SchemVector {
  return (object instanceof SchemList || object instanceof SchemVector);
}

export function isSchemType(object: any): object is SchemType {
  return (object instanceof SchemList ||
          object instanceof SchemVector ||
          object instanceof SchemNumber ||
          object instanceof SchemSymbol ||
          object instanceof SchemKeyword ||
          object instanceof SchemNil ||
          object instanceof SchemString ||
          object instanceof SchemFunction ||
          object instanceof SchemBoolean ||
          object instanceof SchemAtom);
}

export class SchemNumber extends Number {
  isValidKeyType = true;
}

export class SchemString extends String {
  isValidKeyType = true;
}

export class SchemSymbol {
  isValidKeyType = true;
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

export class SchemKeyword {
  isValidKeyType = true;
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
}

export class SchemList extends Array<SchemType> {
  /** Makes sure that all elements of the list are SchemSymbols and returns them in an array.*/
  public asArrayOfSymbols(): SchemSymbol[] {
    return this.map((e) => {
      if (!(e instanceof SchemSymbol)) throw `List contained an element of type ${e} where only symbols where expected`;
      return e;
    });
  }
}

export class SchemVector extends Array<SchemType> {
  public asArrayOfSymbols(): SchemSymbol[] {
    return this.map((e) => {
      if (!(e instanceof SchemSymbol)) throw `Vector contained an element of type ${e} where only symbols where expected`;
      return e;
    });
  }
}

export type SchemMapKey = SchemSymbol | SchemKeyword | SchemString | SchemNumber;

export class SchemMap {
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

  get(key: SchemMapKey): SchemType {
    let v = this.nativeMap.get(this.turnIntoKeyString(key));
    if (v) return v;
    else return SchemNil.instance;
  }

  getValueForSymbol(name: string) {
    return this.get(SchemSymbol.from(name));
  }

  getValueForKeyword(name: string) {
    return this.get(SchemKeyword.from(name));
  }

  /** Changes each value in a SchemMap to the result of Applies the result the provided collback function.
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

}

export type SchemFunctionMetadata = {
  name?: string 
}

export class SchemFunction {
  public isMacro = false;
  constructor(public f: Function,
    public metadata: SchemFunctionMetadata,
    public fnContext?: {ast: SchemType, params: SchemSymbol[], env: Env}) {
    
    // bind a function's name to itself within its environment
    // this allows recursion even in 'anonymous' functions
    if (this.fnContext && metadata.name && metadata.name.length > 0) {
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
}

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

export class SchemAtom {
  constructor(public value: SchemType) {
  }
}