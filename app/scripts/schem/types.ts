export const enum Node {
  List = 1,
  Number,
  String,
  Nil,
  Boolean,
  Symbol,
  Keyword,
  Vector,
  HashMap,
  Function,
  Atom,
}

export type SchemType = SchemList | SchemNumber | SchemSymbol | SchemNil | SchemString | SchemFunction;

export class SchemNumber extends Number {
}

export class SchemString extends String {
}

export class SchemSymbol {
  static registeredSymbols: Map<symbol, SchemSymbol> = new Map<symbol, SchemSymbol>();

  static from(name: string): SchemSymbol {
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

export class SchemList extends Array implements Iterator<SchemType> {
  // type: Node.List = Node.List;
  // meta?: SchemType;

  public list: SchemType[];
  constructor(list: SchemType[] = []) {
    super();
  }

  public next(): IteratorResult<SchemType> {
    return this.next();
  }
}

export class SchemFunction {
  constructor(public f: Function) {
  }
}

export class SchemNil {
}

export class SchemBoolean extends Boolean {
}