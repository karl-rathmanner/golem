import { Env } from './env';

export type SchemType = SchemList | SchemVector| SchemNumber | SchemSymbol | SchemKeyword | SchemNil | SchemString | SchemFunction | SchemBoolean;

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


// broken, lookup not working as intended - but I should really commit now
export class SchemMap extends Map<SchemMapKey, SchemType> {
  /** Returns an array of alternating key value pairs
   * @returns
   * [key: SchemSymbol, value:  SchemType, ...] */
  public flatten(): SchemType[] {
    let a = Array.from(this.keys());
    return Array.from(this.keys()).reduce((acc: SchemType[], currentKey: SchemMapKey) => {
      return acc.concat(currentKey, this.get(currentKey)!);
    }, []);
  }

  get(key: SchemMapKey): SchemType {
    // let that = this;
    let objectKey = Array.from(this.keys()).find((k) => (k.valueOf() === key.valueOf && k.constructor === key.constructor));
    if (objectKey) return this.get(objectKey);
    else return SchemNil.instance;
  }
}

export class SchemFunction {
  constructor(public f: Function, public fnContext?: {ast: SchemType, params: SchemList, env: Env}) {
  }
}

export class SchemNil {
  static instance = new SchemNil();
  private constructor() {}
}


export class SchemBoolean extends Boolean {
}