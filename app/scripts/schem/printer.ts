import { SchemType, SchemNumber, SchemNil, SchemSymbol, SchemList, SchemString, SchemBoolean, SchemFunction } from './types';

export function pr_str(ast: SchemType, escapeStrings: boolean = true): string {
  if (ast instanceof SchemBoolean) {
    return (ast.valueOf()) ? 'true' : 'false';
  } else if (ast instanceof SchemNumber) {
    return ast.toString();
  } else if (ast instanceof SchemNil) {
    return 'nil';
  } else if (ast instanceof SchemSymbol) {
    return ast.name;
  } else if (ast instanceof SchemList) {
    return '(' + ast.map(e => pr_str(e, escapeStrings)).join(' ') + ')';
  } else if (ast instanceof SchemString) {
    if (escapeStrings) {
      return `"${ast.replace(/\\/g, '\\\\')
                .replace(/\n/g, '\\n')
                .replace(/"/g, '\\"')}"`;
    } else {
      return `${ast}`;
    }
  } else if (ast instanceof SchemFunction) {
    return '#function';
  } else {
    console.warn(`pr_str doesn't know how to handle ${ast}`);
    return '';
  }
}