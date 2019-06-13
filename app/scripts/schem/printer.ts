import { isSchemAtom, isSchemBoolean, isSchemLazyVector, isSchemMap, isSchemNumber, isSchemString, isSchemSymbol, isSchemList, isSchemVector, isSchemKeyword, isSchemRegExp, isSchemContextSymbol, isSchemNil, isSchemJSReference, isSchemCollection, isSchemType } from './typeGuards';
import { SchemContextInstance, SchemFunction, SchemList, AnySchemType, SchemVector, SchemNil } from './types';

export async function pr_str(ast: any, escapeStrings: boolean = true): Promise<string> {
    if (isSchemBoolean(ast)) {
        return (ast.valueOf()) ? 'true' : 'false';
    } else if (isSchemNumber(ast)) {
        return ast.toString();
    } else if (ast instanceof SchemNil) { // wat? -> isSchemNil(ast)) {
        return 'nil';
    } else if (isSchemSymbol(ast) || isSchemKeyword(ast) || isSchemRegExp(ast) || isSchemContextSymbol(ast)) {
        return ast.getStringRepresentation();
    } else if (isSchemList(ast)) {
        return '(' + (await ast.amap(e => pr_str(e, escapeStrings))).join(' ') + ')';
    } else if (isSchemVector(ast)) {
        return '[' + (await ast.amap(e => pr_str(e, escapeStrings))).join(' ') + ']';
    } else if (isSchemLazyVector(ast)) {
        const realizedVector = await ast.realizeSubvec(0, (ast.count() === Infinity) ? 10 : ast.count());
        const printedContent = await realizedVector.amap(async e => await pr_str(e, escapeStrings));
        return '[' + printedContent.join(' ') + ((ast.count() === Infinity) ? ' (...)]' : ']');
    } else if (isSchemMap(ast)) {
        const kvpairs = ast.flatten();
        const stringifiedPairs = await kvpairs.amap(e => pr_str(e, escapeStrings));
        return `{${stringifiedPairs.join(' ')}}`;
    } else if (isSchemString(ast)) {
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
    } else if (isSchemAtom(ast)) {
        return `#atom [${JSON.stringify(ast.getValue())}]`;
    } else if (ast instanceof SchemContextInstance) {
        return `#context [${JSON.stringify(ast)}]`;
    } else if (isSchemJSReference(ast)) {
        return `#jsReference [${ast.parent.toString()}, ${ast.propertyName}]`;
    } else {
        // attempt to stringify object, because it's not a SchemType after all

        switch (typeof ast) {
            case 'object': {
                let stringRepresentation = '{}';
                try {
                    stringRepresentation = JSON.stringify(ast);
                } catch { }

                if (stringRepresentation === '{}') {
                    // JSON.stringify might have failed (circular structures) or it might have returned just '{}'
                    // in either case, toString might return a more useful description of the object
                    stringRepresentation = ast.toString();
                }
                return `#jsObject [${stringRepresentation}]`
            }
            case 'function': return `#jsFunction [${ast.toString()}]`;
            default: case 'object': return `#jsValue [${ast}]`;
        }
    }
}



export async function prettyPrint(ast: AnySchemType, escapeStrings: boolean = true, opts: { indentSize: number } = { indentSize: 2 }, currentIndentDepth = 0, addComma = false): Promise<string> {
    if (ast instanceof SchemList) {
        return `(${(await ast.amap(async e => await prettyPrint(e, escapeStrings, opts, currentIndentDepth + 1))).join(' ')})` +
            (addComma ? ',' : '');
    } else if (ast instanceof SchemVector) {
        return '[' +
            (await ast.amap(async (e, index) => {
                return await prettyPrint(e, escapeStrings, opts, currentIndentDepth + 1, (index < ast.length - 1));
            })).join(' ') +
            ']' +
            (addComma ? ',' : '');
    } else if (isSchemLazyVector(ast)) {
        const realizedVector = await ast.realizeSubvec(0, (ast.count() === Infinity) ? 10 : ast.count());
        const stringyfiedContent = await realizedVector.amap(
            async (element, index) => {
                return await prettyPrint(element, escapeStrings, opts, currentIndentDepth + 1, (index < ast.count() - 1));
            });

        return '[' +
            stringyfiedContent.join(' ') +
            ((ast.count() === Infinity) ? ' (...)]' : ']') +
            (addComma ? ',' : '');

    } else if (isSchemMap(ast)) {
        const numberOfElements = ast.flatten().length;
        return '{\n' +
            ' '.repeat(opts.indentSize * (currentIndentDepth + 1)) +
            ast.flatten().map(async (e, index) => {
                let useComma = ((index % 2) > 0) && (index < numberOfElements - 1);
                return await prettyPrint(e, escapeStrings, opts, currentIndentDepth + 1, useComma);
            }).join(' ') +
            '\n' + ' '.repeat(opts.indentSize * (currentIndentDepth)) +
            '}' +
            (addComma ? ',' : '');
    } else {
        return await pr_str(ast, escapeStrings) + (addComma ? ',' : '');
    }
}

export async function prettyLog(ast: AnySchemType): Promise<void> {
    if (isSchemList(ast) || isSchemVector(ast) || isSchemMap(ast)) {
        let groupTitle = 'unknown collection type';
        let flatCollection;

        if (isSchemMap(ast)) {
            flatCollection = ast.flatten();
            groupTitle = '{';
        } else {
            if (isSchemList(ast)) {
                groupTitle = `(`;
            } else if (isSchemVector(ast)) {
                groupTitle = '[';
            } 
            flatCollection = ast;
        }

        let previewString = '';
        for (let i = 0; i < flatCollection.length && previewString.length < 100; i++) {
            previewString += await pr_str(flatCollection[i]) + ' ';
        }

        if (previewString.length > 100) {
            previewString = previewString.slice(0, 100) + ' (...)';
        } else {
            if (isSchemMap(ast)) previewString.replace(/ $/, '}');
            if (isSchemList(ast)) previewString.replace(/ $/, ')');
            if (isSchemVector(ast)) previewString.replace(/ $/, ']')
        }

        console.groupCollapsed(groupTitle + previewString);

        for (let i = 0; i < flatCollection.length; i++) {
            if (i > 100) {
                console.log(`[omitting ${flatCollection.length - i} more items]`)
                i = flatCollection.length;
            }
            await prettyLog(flatCollection[i]);
        }
        console.groupEnd();
    } else {
        if (isSchemType(ast)) {
            console.log(await pr_str(ast));
        } else {
            console.log(ast);
        }
    }
    return undefined;
}
