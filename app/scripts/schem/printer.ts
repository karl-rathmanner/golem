import { SchemType, SchemNumber, SchemNil, SchemSymbol, SchemList, SchemString } from './types';

export function pr_str(obj: SchemType, escapeStrings: boolean = true): string {
  if (obj instanceof SchemNumber) {
    return obj.value.toString();
  } else if (obj instanceof SchemNil) {
    return 'nil';
  } else if (obj instanceof SchemSymbol) {
    return obj.name;
  } else if (obj instanceof SchemList) {
    return '(' + obj.map(e => pr_str(e)).join(' ') + ')';
  } else if (obj instanceof SchemString) {
    if (escapeStrings) {
      return `"${obj.replace(/\\/g, '\\\\')
                .replace(/\n/g, '\\n')
                .replace(/"/g, '\\"')}"`;
    } else {
      return obj as string;
    }
  } else {
    console.warn(`pr_str doesn't know how to handle ${obj}`);
    return '';
  }
}