import * as monaco from 'monaco-editor';
import { getAllProperties, resolveJSPropertyChain } from '../javascriptInterop';
import { Schem } from '../schem/schem';
import { isSchemCollection, isSchemFunction, isSchemList, isSchemSymbol, isSchemType } from '../schem/typeGuards';
import { AnySchemType, SchemContextSymbol, SchemSymbol, SchemTypes } from '../schem/types';
import ILanguage = monaco.languages.IMonarchLanguage;

export function AddSchemSupportToEditor(interpreter: Schem) {
    registerLanguage();
    setLanguageConfiguration();
    setMonarchTokensProvider();
    registerCompletionItemProvider();
    SetInterpreterForCompletion(interpreter);
}

let interpreterForCompletion: Schem;

export function SetInterpreterForCompletion(interpreter: Schem) {
    interpreterForCompletion = interpreter;
}

function registerLanguage() {
    monaco.languages.register({
        id: 'schem',
        extensions: ['.schem'],
        aliases: ['Schem'],
    });
}

function setLanguageConfiguration() {
    monaco.languages.setLanguageConfiguration('schem', {
        autoClosingPairs: [
            // TODO: autoclose when parinfer is turned off
            // { open: '(', close: ')' },
            // { open: '[', close: ']' },
            // { open: '{', close: '}' },
            { open: '"', close: '"' },
        ],
        brackets: [
            ['{', '}'],
            ['[', ']'],
            ['(', ')'],
            ['<', '>']
        ],
        comments: {
            lineComment: ';'
        },
    });
}

const specialFormsAndKeywords = [
    'def', 'defmacro', 'defcontext', 'let', 'do', 'if', 'fn',
    'quote', 'quasiquote', 'unquote', 'macroexpand', 'macroexpand-all', 'set-interpreter-options',
];

function setMonarchTokensProvider() {
    // placeholder borrowed from: https://github.com/Microsoft/monaco-languages/blob/master/src/clojure/clojure.ts
    // TODO: revisit https://microsoft.github.io/monaco-editor/monarch.html and rewrite/adapt tokenizer
    monaco.languages.setMonarchTokensProvider('schem', <ILanguage>{
        defaultToken: '',
        ignoreCase: false,
        tokenPostfix: '.schem',
        brackets: [
            { open: '(', close: ')', token: 'delimiter.parenthesis' },
            { open: '{', close: '}', token: 'delimiter.curly' },
            { open: '[', close: ']', token: 'delimiter.square' },
        ],
        keywords: specialFormsAndKeywords,
        constants: ['true', 'false', 'nil'],
        tokenizer: {
            root: [
                // [/#[xXoObB][0-9a-fA-F]+/, 'number.hex'],
                [/[+-]?\d+(?:(?:\.\d*)?(?:[eE][+-]?\d+)?)?/, 'number.float'],
                [/(?:\b(?:(def|defn|defmacro|defmulti|defonce|ns|ns-unmap|fn))\b)(\s+)((?:\w|\-|\!|\?)*)/, ['keyword', 'white', 'variable']],
                [
                    /[a-zA-Z_#][a-zA-Z0-9_\-\?\!\*]*/,
                    {
                        cases: {
                            '@keywords': 'keyword',
                            '@constants': 'constant',
                            '@default': 'identifier',
                        },
                    },
                ],
                { include: '@whitespace' },
                { include: '@strings' },
            ],
            comment: [
                [/[^\(comment]+/, 'comment'],
                [/\)/, 'comment', '@push'],
                [/\(comment/, 'comment', '@pop'],
                [/[\)]/, 'comment'],
            ],
            whitespace: [
                [/[ \t\r\n]+/, 'white'],
                [/\(comment/, 'comment', '@comment'],
                [/;.*$/, 'comment'],
            ],
            strings: [
                [/"$/, 'string', '@popall'],
                [/"(?=.)/, 'string', '@multiLineString'],
            ],
            multiLineString: [
                [/\\./, 'string.escape'],
                [/"/, 'string', '@popall'],
                [/.(?=.*")/, 'string'],
                [/.*\\$/, 'string'],
                [/.*$/, 'string', '@popall'],
            ],
        },
    });
}

function registerCompletionItemProvider() {
    monaco.languages.registerCompletionItemProvider('schem', {
        triggerCharacters: ['.'],
        // provideCompletionItems: (textModel, position, context, token): monaco.languages.ProviderResult<Promise<monaco.languages.CompletionList>> => {
        provideCompletionItems: (textModel, position, context, token) => {
            const word = textModel.getWordUntilPosition(position);
            const defaultRange: monaco.IRange = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn
            };

            // Completion was triggered by the user typing a dot -> propose javascript completion items
            if (context.triggerCharacter === '.') {
                return createJSCompletionItems(textModel, position, defaultRange);
            } else {
                // propose schem completion items
                return createSchemCompletionItems(defaultRange);
            }
        }
    });
}

/** Creates a list of completion items of all symbols currently bound in the interpreter's root environment. */
async function createSchemCompletionItems(range: monaco.IRange): Promise<monaco.languages.CompletionList> {

    /** Turns a single schem symbol into a completion item with runtime information */
    function schemSymbolToCompletionItem(sym: SchemSymbol): monaco.languages.CompletionItem {
        const resolvedValue: any = interpreterForCompletion.replEnv.get(sym);

        const pickKind = (v: any) => {
            // Not caring about the semantics here, just trying to pick ones with a fitting icon
            // TODO: see if CompletionItemKind can be extended or customized

            if (!isSchemType(v)) {
                return monaco.languages.CompletionItemKind.Value;
            } else switch (v.typeTag) {
                case SchemTypes.SchemFunction: return monaco.languages.CompletionItemKind.Function;
                case SchemTypes.SchemSymbol: return monaco.languages.CompletionItemKind.Variable;
                case SchemTypes.SchemContextSymbol:
                case SchemTypes.SchemContextDefinition:
                case SchemTypes.SchemContextInstance:
                    return monaco.languages.CompletionItemKind.Reference;
                default:
                    return monaco.languages.CompletionItemKind.Value;
            }
        };

        const pickInsertText = (symbol: SchemSymbol | SchemContextSymbol, value: AnySchemType | any) => {
            if (!isSchemType(value)) {
                return symbol.name;
            }
            if (isSchemSymbol(symbol)) {
                if (value.typeTag === SchemTypes.SchemFunction) {
                    return symbol.name + ' ';
                } else {
                    return symbol.name + ' ';
                }
            } else {
                return symbol.name + ': ';
            }
        };

        const pickDetail = (value: AnySchemType | any) => {
            if (!isSchemType(value)) {
                if (value === null) return `null`;
                if (value === undefined) return `undefined`;
                if (typeof value === 'object') return `${typeof value}: ${('toString' in value) ? value.toString() : value}`;
                return `${typeof value}: ${value}`;
            }
            if (isSchemFunction(value)) {
                if (value.isMacro) {
                    return `Macro`;
                } else {
                    return `Function`;
                }
            } else if (isSchemCollection(value)) {
                return `${SchemTypes[value.typeTag]} with ${value.count()} items`; // printing a collection would be asynchronous and might have side effects, so I won't do that for now
            } else {
                // TODO: handle keywords, atoms etc.
                return `${SchemTypes[value.typeTag]}: ${value.toString()}`;
            }
        };

        const pickDocumentation = (value: any) => {
            if (isSchemFunction(value)) {
                if (value.metadata != null) {
                    return `[${value.metadata.parameters == null ? '' : value.metadata.parameters.join(' ')}]\n${value.metadata.docstring}`;
                }
            }

            return 'No documentation';
        };

        return {
            label: sym.name,
            kind: pickKind(resolvedValue),
            insertText: pickInsertText(sym, resolvedValue),
            detail: pickDetail(resolvedValue),
            documentation: pickDocumentation(resolvedValue),
            range: range
        };
    }

    // Create completion items for built-in keywords
    let reservedKeywordCompletionItems: monaco.languages.CompletionItem[] = [];

    specialFormsAndKeywords.forEach(kw => {
        reservedKeywordCompletionItems.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw + ' ',
            detail: 'special form or reserved word',
            range: range
        });
    });

    // Get all symbols bound in the interpreter's root environment
    let symbols = await interpreterForCompletion.readEval(`(list-symbols)`);
    if (isSchemList(symbols)) {
        const completionItems: monaco.languages.CompletionItem[] = symbols.map(schemSymbolToCompletionItem);
        return { suggestions: completionItems.concat(reservedKeywordCompletionItems) };
    } else {
        // Environment contains no symbols, which would be weird. Let's not make a scene about it...
        return { suggestions: reservedKeywordCompletionItems };
    }
}

/** Handles completion for js-symbols by looking up object properties in the current editor environment at runtime.
 * TODO: Add special case for foreign execution context forms? (By looking up properties in foreign js contexts.)
*/
function createJSCompletionItems(textModel: monaco.editor.ITextModel, position: monaco.Position, defaultRange: monaco.IRange): monaco.languages.CompletionList {
    let jsCompletionItems: monaco.languages.CompletionItem[] = [];

    // starting at the cursor position and going left:
    // find the first character that isn't either alphanumeric or a dot
    // "(foo (aaa.bbb.cc█ dd)" -> "aaa.bbb.ccc"
    let columnOfLeftmostWOrDot;
    for (columnOfLeftmostWOrDot = position.column; columnOfLeftmostWOrDot > 0; columnOfLeftmostWOrDot--) {
        const characterAtColumn = textModel.getValueInRange({
            startColumn: columnOfLeftmostWOrDot - 1,
            endColumn: columnOfLeftmostWOrDot,
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber
        });

        if (!/[\w.]/.test(characterAtColumn)) break;
    }

    const jsSymbol = textModel.getValueInRange({
        startColumn: columnOfLeftmostWOrDot,
        endColumn: position.column,
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber
    });

    // find the part of the completion word that comes before the last dot
    // "aaa.bbb.ccc" -> "aaa.bbb"
    const matches = jsSymbol.match(/(.*)\.(.*)/);
    let partBeforeLastDot = (matches && matches.length > 0) ? matches[1] : null;

    if (partBeforeLastDot != null) {
        let obj: any = resolveJSPropertyChain(window, partBeforeLastDot);
        if (obj != null) {
            const properties = getAllProperties(obj);
            const typeToKind = (type: 'string' | 'number' | 'boolean' | 'symbol' | 'undefined' | 'object' | 'function' | 'bigint') => {
                // these are picked based for the icon monaco displays, not for semantic reasons
                switch (type) {
                    case 'object': return monaco.languages.CompletionItemKind.Module;
                    case 'function': return monaco.languages.CompletionItemKind.Function;
                    default: return monaco.languages.CompletionItemKind.Variable;
                }
            };
            if (properties != null) properties.forEach(propertyName => {
                const type = typeof obj[propertyName];

                jsCompletionItems.push({
                    label: propertyName,
                    commitCharacters: ['.'],
                    kind: typeToKind(type),
                    insertText: propertyName,
                    detail: `Javascript ${type}`,
                    range: defaultRange
                });


            });
        }
    }

    return { suggestions: jsCompletionItems};
}