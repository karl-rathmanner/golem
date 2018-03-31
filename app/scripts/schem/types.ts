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


export class SchemMap {
  private map: Map<string, SchemType> = new Map<string, SchemType>();

  /** Returns an array of alternating key value pairs
   * @returns
   * [key: SchemSymbol, value:  SchemType, ...] */
  public flatten(): SchemType[] {
    return Array.from(this.map.keys()).reduce((acc: SchemType[], currentKey: string) => {

      return acc.concat(this.createSchemTypeForKeyString(currentKey), this.map.get(currentKey)!);
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
    this.map.set(this.turnIntoKeyString(key), value);
  }

  get(key: SchemMapKey): SchemType {
    let v = this.map.get(this.turnIntoKeyString(key));
    if (v) return v;
    else return SchemNil.instance;
  }

}


// export class SchemMap {
//   map: Map<SchemMapKey, SchemType> = new Map<SchemMapKey, SchemType>();

//   /** Returns an array of alternating key value pairs
//    * @returns
//    * [key: SchemSymbol, value:  SchemType, ...] */
//   public flatten(): SchemType[] {
//     return Array.from(this.map.keys()).reduce((acc: SchemType[], currentKey: SchemMapKey) => {
//       return acc.concat(currentKey, this.map.get(currentKey)!);
//     }, []);
//   }
// }


export class SchemFunction {
  constructor(public f: Function,
    public metadata: {name: string} = {name: 'anonymous'},
    public fnContext?: {ast: SchemType, params: SchemList, env: Env}) {
  }
}

export class SchemNil {
  static instance = new SchemNil();
  private constructor() {}
}


export class SchemBoolean extends Boolean {
}