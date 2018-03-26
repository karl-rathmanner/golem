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

export type SchemType = SchemList | SchemNumber | SchemSymbol | SchemNil | SchemString;

export class SchemNumber extends Number {
}

export class SchemString extends String {
}

export class SchemSymbol {
  constructor(public name: string) {
    // return Symbol.for(name);
  }
}

export class SchemList extends Array {
  // type: Node.List = Node.List;
  // meta?: SchemType;

  public list: SchemType[];
  constructor(list: SchemType[] = []) {
    super();
  }
}

export class SchemFunction extends Function {
}

export class SchemNil extends null {
}
