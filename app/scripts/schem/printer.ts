import { isSchemAtom, isSchemBoolean, isSchemLazyVector, isSchemMap, isSchemNumber, isSchemString, isSchemSymbol, isSchemList, isSchemVector, isSchemKeyword, isSchemRegExp, isSchemContextSymbol, isSchemNil, isSchemJSReference } from './typeGuards';
import { SchemContextInstance, SchemFunction, SchemList, AnySchemType, SchemVector, SchemNil } from './types';

export async function pr_str(ast: AnySchemType, escapeStrings: boolean = true): Promise<string> {
  if (isSchemBoolean(ast)) {
    return (ast.valueOf()) ? 'true' : 'false';
  } else if (isSchemNumber(ast)) {
    return ast.toString();
  } else if (ast instanceof SchemNil) { // wat? -> isSchemNil(ast)) {
    return 'nil';
  } else if (isSchemSymbol(ast) || isSchemKeyword(ast) ||  isSchemRegExp(ast) ||  isSchemContextSymbol(ast)) {
    return ast.getStringRepresentation();
  } else if (isSchemList(ast)) {
    return '(' + (await ast.amap(e => pr_str(e, escapeStrings))).join(' ') + ')';
  } else if (isSchemVector(ast)) {
    return '[' + (await ast.amap(e => pr_str(e, escapeStrings))).join(' ') + ']';
  } else if ( isSchemLazyVector(ast)) {
    const realizedVector = await ast.realizeSubvec(0, (ast.count() === Infinity) ? 10 : ast.count());
    const printedContent = await realizedVector.amap(async e => await pr_str(e, escapeStrings));
    return '[' + printedContent.join(' ') + ((ast.count() === Infinity) ? ' (...)]' : ']');
  } else if ( isSchemMap(ast)) {
    const kvpairs = ast.flatten();
    const stringifiedPairs = await kvpairs.amap(e => pr_str(e, escapeStrings));
    return `{${stringifiedPairs.join(' ')}}`;
  } else if ( isSchemString(ast)) {
    if (escapeStrings) {
      return `"${ast.replace(/\\/g, '\\\\')
                .replace(/\n/g, '\\n')
                .replace(/"/g, '\\"')}"`;
    } else {
      return `${ast}`;
    }
  } else if (ast instanceof SchemFunction) {
    if (ast.isMacro) {
      return `#macroFunction [${JSON.stringify(ast.metadata)}]`;
    } else {
      return `#function [${JSON.stringify(ast.metadata)}]`;
    }
  } else if ( isSchemAtom(ast)) {
    return `#atom [${JSON.stringify(ast.getValue())}]`;
  } else if (ast instanceof SchemContextInstance) {
    return `#context [${JSON.stringify(ast)}]`;
  } else if (isSchemJSReference(ast)) {
    return `#jsReference [${ast.parent.toString()}, ${ast.propertyName}]`;
  } else {
    // attempt to stringify object, because it's not a SchemType after all
    return `#jsObject [${JSON.stringify(ast)}]`;
  }
}



export async function prettyPrint(ast: AnySchemType, escapeStrings: boolean = true, opts: {indentSize: number} = {indentSize: 2}, currentIndentDepth = 0, addComma = false): Promise<string> {
  if (ast instanceof SchemList) {
    return `(${(await ast.amap(e => prettyPrint(e, escapeStrings, opts, currentIndentDepth + 1))).join(' ')})` +
      (addComma ? ',' : '');
  } else if (ast instanceof SchemVector) {
    return '[' +
      (await ast.amap((e, index) => {
        return prettyPrint(e, escapeStrings, opts, currentIndentDepth + 1, (index < ast.length - 1));
      })).join(' ') +
      ']' +
      (addComma ? ',' : '');
  } else if ( isSchemLazyVector(ast)) {
    const realizedVector = await ast.realizeSubvec(0, (ast.count() === Infinity) ? 10 : ast.count());
    const stringyfiedContent = await realizedVector.amap(
      async (element, index) => {
        return await prettyPrint(element, escapeStrings, opts, currentIndentDepth + 1, (index < ast.count() - 1));
      });

    return '[' +
      stringyfiedContent.join(' ') +
      ((ast.count() === Infinity) ? ' (...)]' : ']') +
      (addComma ? ',' : '');

  } else if ( isSchemMap(ast)) {
    const numberOfElements = ast.flatten().length;
    return '{\n' +
      ' '.repeat(opts.indentSize * (currentIndentDepth + 1)) +
      ast.flatten().map((e, index) => {
        let useComma = ((index % 2) > 0) && (index < numberOfElements - 1);
        return prettyPrint(e, escapeStrings, opts, currentIndentDepth + 1, useComma);
      }).join(' ') +
      '\n' + ' '.repeat(opts.indentSize * (currentIndentDepth)) +
      '}' +
      (addComma ? ',' : '');
  } else {
    return await pr_str(ast, escapeStrings) + (addComma ? ',' : '');
  }
}