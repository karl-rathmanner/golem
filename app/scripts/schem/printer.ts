import { SchemType, SchemNumber, SchemNil, SchemSymbol, SchemList, SchemString, SchemBoolean, SchemFunction, SchemVector, SchemMap, SchemKeyword, SchemAtom, SchemRegExp, LazyVector, SchemContext, SchemContextSymbol } from './types';

export async function pr_str(ast: SchemType, escapeStrings: boolean = true): Promise<string> {
  if (ast instanceof SchemBoolean) {
    return (ast.valueOf()) ? 'true' : 'false';
  } else if (ast instanceof SchemNumber) {
    return ast.toString();
  } else if (ast instanceof SchemNil) {
    return 'nil';
  } else if (ast instanceof SchemSymbol || ast instanceof SchemKeyword || ast instanceof SchemRegExp || ast instanceof SchemContextSymbol) {
    return ast.getStringRepresentation();
  } else if (ast instanceof SchemList) {
    return '(' + (await ast.amap(e => pr_str(e, escapeStrings))).join(' ') + ')';
  } else if (ast instanceof SchemVector) {
    return '[' + (await ast.amap(e => pr_str(e, escapeStrings))).join(' ') + ']';
  } else if (ast instanceof LazyVector) {
    const realizedVector = await ast.realizeSubvec(0, (ast.count() === Infinity) ? 10 : ast.count());
    const printedContent = await realizedVector.amap(async e => await pr_str(e, escapeStrings));
    return '[' + printedContent.join(' ') + ((ast.count() === Infinity) ? ' (...)]' : ']');
  } else if (ast instanceof SchemMap) {
    const kvpairs = ast.flatten();
    const stringifiedPairs = await kvpairs.amap(e => pr_str(e, escapeStrings));
    return `{${stringifiedPairs.join(' ')}}`;
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
      return `#macroFunction [${JSON.stringify(ast.metadata)}]`;
    } else {
      return `#function [${JSON.stringify(ast.metadata)}]`;
    }
  } else if (ast instanceof SchemAtom) {
    return `#atom [${JSON.stringify(ast.value)}]`;
  } else if (ast instanceof SchemContext) {
    return `#context [${JSON.stringify(ast)}]`;
  } else {
    // attempt to stringify object, because it's not a SchemType after all
    return `#jsObject [${JSON.stringify(ast)}]`;
  }
}

export async function prettyPrint(ast: SchemType, escapeStrings: boolean = true, opts: {indentSize: number} = {indentSize: 2}, currentIndentDepth = 0, addComma = false): Promise<string> {
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
  } else if (ast instanceof LazyVector) {
    const realizedVector = await ast.realizeSubvec(0, (ast.count() === Infinity) ? 10 : ast.count());
    const stringyfiedContent = await realizedVector.amap(
      async (element, index) => {
        return await prettyPrint(element, escapeStrings, opts, currentIndentDepth + 1, (index < ast.count() - 1));
      });

    return '[' +
      stringyfiedContent.join(' ') +
      ((ast.count() === Infinity) ? ' (...)]' : ']') +
      (addComma ? ',' : '');

  } else if (ast instanceof SchemMap) {
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