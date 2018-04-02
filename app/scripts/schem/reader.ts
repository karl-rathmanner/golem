import {SchemType, SchemList, SchemNumber, SchemSymbol, SchemNil, SchemString, SchemBoolean, SchemVector, SchemMap, SchemKeyword} from './types';

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
      return readParen(reader, '(');
    }
    case ')': {
      throw `unexpected ')'`;
    }
    case '[': {
      return readParen(reader, '[');
    }
    case ']': {
      throw `unexpected ']'`;
    }
    case '{': {
      return readParen(reader, '{');
    }
    case '}': {
      throw `unexpected '}'`;
    }
    default: {
      return readAtom(reader);
    }
  }
}

function readParen(reader: Reader, openParen: string): SchemType {
  let closeParen: string, collection;

  switch (openParen) {
    case '(': {
      closeParen = ')';
      collection = new SchemList();
      break;
    }
    case '[': {
      closeParen = ']';
      collection = new SchemVector();
      break;
    }
    case '{': {
      closeParen = '}';
      collection = new SchemMap();
      break;
    }
    default: {
      return SchemNil.instance;
    }
  }

  const token = reader.next();
  if (token !== openParen ) {
    throw `expected ${openParen}, got ${token} instead`;
  }

  while (reader.peek() !== closeParen) {
    if (typeof reader.peek() === 'undefined') {
      throw 'unexpected EOF';
    }

    // note: readForm calls readParen or readAtom which advances the reader's position
    if (collection instanceof SchemMap) {
      const possibleKey = readForm(reader);
      const value = readForm(reader);

      if (possibleKey instanceof SchemSymbol || possibleKey instanceof SchemKeyword || possibleKey instanceof SchemString || possibleKey instanceof SchemNumber) {
        collection.set(possibleKey, value);
      } else {
        throw `Map keys must be of type Symbol, String or Number`;
      }
    } else {
      collection.push(readForm(reader));
    }
  }

  reader.next(); // drop close paren
  return collection;
}

function readAtom(reader: Reader) {
  const token = reader.next();
  if (/^-?\d+$/.test(token)) {
    return new SchemNumber(parseInt(token));
  } else if (/^-?\d*\.\d+$/.test(token)) {
    return new SchemNumber(parseFloat(token));
  } else if (token[0] === '"') {
    const value = token.substr(1, token.length - 2)
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\');
    return new SchemString(value);
  } else if (token[0] === ':') {
    return SchemKeyword.from(token.slice(1));
  } else switch (token) {
    case 'true': return new SchemBoolean(true);
    case 'false': return new SchemBoolean(false);
    case 'nil': return SchemNil.instance;
  }
  return SchemSymbol.from(token);
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