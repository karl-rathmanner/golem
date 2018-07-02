import {SchemType, SchemList, SchemNumber, SchemSymbol, SchemNil, SchemString, SchemBoolean, SchemVector, SchemMap, SchemKeyword, isSchemType, isSequential, SchemMapKey} from './types';

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
  const tokens = tokenize(input);

  if (tokens.length === 0 ) {
    throw `tried to evaluate empty expression`;
  }

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
    case '\'': {
      reader.next();
      return new SchemList(SchemSymbol.from('quote'), readForm(reader));
    }
    case '`': {
      reader.next();
      return new SchemList(SchemSymbol.from('quasiquote'), readForm(reader));
    }
    case '~': {
      reader.next();
      return new SchemList(SchemSymbol.from('unquote'), readForm(reader));
    }
    case '~@': {
      reader.next();
      return new SchemList(SchemSymbol.from('splice-unquote'), readForm(reader));
    }
    case '@': {
      reader.next();
      return new SchemList(SchemSymbol.from('deref'), readForm(reader));
    }
    case '#': {
      reader.next();
      switch (reader.peek()[0]) {
        case '"':
          return new SchemList(SchemSymbol.from('re-pattern'), readForm(reader));
        case '(':
          return expandFnShorthand(reader);
      }
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
    case 'true': return SchemBoolean.true;
    case 'false': return SchemBoolean.false;
    case 'nil': return SchemNil.instance;
  }
  return SchemSymbol.from(token);
}

function expandFnShorthand(reader: Reader) {
  let fnBody = readParen(reader, '(');
  if (!(fnBody instanceof SchemList)) {
    throw `fn shorthand failed, expected list`;
  } else {

    let containsNestedFnShorthands = false;
    let containsAmpersandArg = false;
    let highestPlaceholderNumber = 0;

    const analyzeAndMassageCollection = (element: SchemType, indexOrKey: number | SchemMapKey, collection?: SchemType[]): SchemType => {
      if (element instanceof SchemSymbol &&
        element.name === '#' &&
        typeof indexOrKey === 'number' &&
        typeof collection !== 'undefined' &&
        collection[indexOrKey + 1] instanceof SchemSymbol &&
        (collection[indexOrKey + 1] as SchemSymbol).name === '(') {
          containsNestedFnShorthands = true;
      }

      if (element instanceof SchemSymbol) {
        if (element.name === '%') {
          highestPlaceholderNumber = Math.max(1, highestPlaceholderNumber);
          return SchemSymbol.from('%1');
        } else if (/%\d$/.test(element.name)) {
          const currentPlaceholderNumber: number = (element.name === '%') ? 1 : Number.parseInt(element.name[1]);
          highestPlaceholderNumber = Math.max(currentPlaceholderNumber, highestPlaceholderNumber);
        } else if (element.name === '%&') {
          containsAmpersandArg = true;
        }
      }

      if (element instanceof SchemVector || element instanceof SchemList) {
        return element.map(analyzeAndMassageCollection);
      } if (element instanceof SchemMap) {
        return element.map(analyzeAndMassageCollection as any); // Deliberately not caring about the actual method signature, here...
      }

      return element;
    };

    /* TODO: fix check
    if (containsNestedFnShorthands) {
      throw `You shall not nest thy #()s!`;
    }*/

    fnBody = fnBody.map(analyzeAndMassageCollection);

    let anonymousArgs = new Array<SchemType>();

    for (let i = 1; i <= highestPlaceholderNumber; i++) {
      anonymousArgs.push(SchemSymbol.from('%' + i));
    }

    if (containsAmpersandArg) {
      anonymousArgs.push(SchemSymbol.from('&'), SchemSymbol.from('%&'));
    }

    if (!(fnBody instanceof SchemList)) {
      throw `Something went wrong during fn-shorthand expansion. Needless to say: this should never happen.`;
    }

    return new SchemList(SchemSymbol.from('fn'), new SchemList(...anonymousArgs), new SchemList(...fnBody as SchemList));
  }
}

export function tokenize(input: string): string[] {
  const regex = /[\s,]*(~@|[\[\]{}()'`~^@]|"(?:\\.|[^\\"])*"|;.*|[^\s\[\]{}('"`,;)]*)/g;
  let matches: RegExpExecArray | null;
  let tokens: string[] = [];

  while ((matches = regex.exec(input)) !== null) {
    const match = matches[1];
    if (match === '') break;
    if (match[0] !== ';') {
      // add token unless it's a comment
      tokens.push(match);
    }
  }
  return tokens;
}