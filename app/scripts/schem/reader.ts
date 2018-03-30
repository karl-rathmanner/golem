import {SchemType, SchemList, SchemNumber, SchemSymbol, SchemNil, SchemString, SchemBoolean} from './types';

class Reader {
  private position = 0;

  constructor(private tokens: string[]) { }

  public peek(): string {
    return this.tokens[this.position];
  }

  public next(): string {
      return this.tokens[this.position++];
  }
}

export function readStr(input: string): SchemType {
  const tokens = tokenizer(input);

  if (tokens === []) return SchemNil; // read a comment

  const reader = new Reader(tokens);
  return readForm(reader);
}

function readForm(reader: Reader): SchemType {
  switch (reader.peek()) {
    case '(': {
      return readList(reader);
    }
    case ')': {
      throw `unexpected ')'`;
    }
    default: {
      return readAtom(reader);
    }
  }
}

function readList(reader: Reader): SchemList {
  const list: SchemList = new SchemList();
  reader.next(); // drop open paren

  while (reader.peek() !== ')') {
    if (typeof reader.peek() === 'undefined') {
      throw 'unexpected EOF';
    }

    list.push(readForm(reader));
  }

  reader.next(); // drop close paren
  return list;
}

function readAtom(reader: Reader) {
  const token = reader.next();
  if (/^-?\d+$/.test(token)) {
    return new SchemNumber(parseInt(token));
  } else if (/^-?\d*\.\d+$/.test(token)) {
    return new SchemNumber(parseFloat(token));
  } else if (token === 'true') {
    return new SchemBoolean(true);
  } else if (token === 'false') {
    return new SchemBoolean(false);
  } else if (token === 'nil') {
    return SchemNil.instance;
  } else if (token[0] === '"') {
    const value = token.substr(1, token.length - 2)
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\');

    return new SchemString(value);
  } else {
    return SchemSymbol.from(token);
  }

}

function tokenizer(input: string): string[] {
  const regex = /[\s,]*(~@|[\[\]{}()'`~^@]|"(?:\\.|[^\\"])*"|;.*|[^\s\[\]{}('"`,;)]*)/g;
  let matches: RegExpExecArray | null;
  let tokens: string[] = [];

  while ((matches = regex.exec(input)) !== null) {
    const match = matches[1];
    if (match === '') break;
    tokens.push(match);
  }
  return tokens;
}