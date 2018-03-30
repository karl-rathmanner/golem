import { Env } from './env';

export type SchemType = SchemList | SchemNumber | SchemSymbol | SchemNil | SchemString | SchemFunction;

export class SchemNumber extends Number {
}

export class SchemString extends String {
}

export class SchemSymbol {
  static registeredSymbols: Map<symbol, SchemSymbol> = new Map<symbol, SchemSymbol>();

  static from(name: string): SchemSymbol {
    // Creates symbols using the global symbol registry, so the same name maps to the same symbol
    const sym: symbol = Symbol.for(name);

    if (this.registeredSymbols.has(sym)) {
      return this.registeredSymbols.get(sym)!;
    } else {
      const newSchemSymbol = new SchemSymbol(name);
      this.registeredSymbols.set(sym, newSchemSymbol);
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