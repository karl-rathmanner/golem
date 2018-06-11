import { SchemType, SchemNumber, SchemNil, SchemSymbol, SchemList, SchemString, SchemBoolean, SchemFunction, SchemVector, SchemMap, SchemKeyword, SchemAtom } from './types';

export function pr_str(ast: SchemType, escapeStrings: boolean = true): string {
  if (ast instanceof SchemBoolean) {
    return (ast.valueOf()) ? 'true' : 'false';
  } else if (ast instanceof SchemNumber) {
    return ast.toString();
  } else if (ast instanceof SchemNil) {
    return 'nil';
  } else if (ast instanceof SchemSymbol) {
    return ast.name;
  } else if (ast instanceof SchemKeyword) {
    return ':' + ast.name;
  } else if (ast instanceof SchemList) {
    return '(' + ast.map(e => pr_str(e, escapeStrings)).join(' ') + ')';
  } else if (ast instanceof SchemVector) {
    return '[' + ast.map(e => pr_str(e, escapeStrings)).join(' ') + ']';
  } else if (ast instanceof SchemMap) {
    return '{' + ast.flatten().map(e => pr_str(e, escapeStrings)).join(' ') + '}';
  } else if (ast instanceof SchemString) {
    if (escapeStrings) {
      return `"${ast.replace(/\\/g, '\\\\')
                .replace(/\n/g, '\\n')
                .replace(/"/g, '\\"')}"`;
    } else {
      return `${ast}`;
    }
  } else if (ast instanceof SchemFunction) {
    if (ast.isMacro) {
      return `#object [macroFunction ${JSON.stringify(ast.metadata)}]`;
    } else {
      return `#object [function ${JSON.stringify(ast.metadata)}]`;
    }
  } else if (ast instanceof SchemAtom) {
    return `#object [atom ${JSON.stringify(ast.value)}]`;
  } else {
    console.warn(`pr_str doesn't know how to handle ${ast}`);
    return '';
  }
}