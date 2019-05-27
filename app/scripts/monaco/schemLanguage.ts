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
    registerHoverProvider();
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
interface SpecialFormsAndKeywordsMetadata {
    [sym: string]: { paramstring: string, docstring: string };
}
const specialFormsAndKeywords: SpecialFormsAndKeywordsMetadata = {
    'def': { paramstring: 'symbol value', docstring: `Binds 'value' to a symbol in the current environment.` },
    'defmacro': { paramstring: 'name docstring? [parameters] & expressions', docstring: 'Creates and binds a macro function in the current environment.' },
    'defcontext': { paramstring: 'context-symbol options?', docstring: 'Creates and binds a context definition in the current environment. \n e.g.: (defcontext any-tab: {:tabQuery {:url "*://*/*"} :features ["schem-interpreter"]})' },
    'let': { paramstring: '[symbol1 value1 symbol2 value2 ...] & expressions', docstring: `Creates a new child environment and binds a list of symbols and values, then the 'expressions' are evaluated in that environment. The binding vector supports basic destructuring.` },
    'do': { paramstring: 'expression & more-expressions', docstring: 'Evaluates all expressions in sequence, but only returns the value of the last one.' },
    'if': { paramstring: 'condition true-expr & else-expr', docstring: `If 'condition' evaluates to true, 'true-expr' is evaluated and its value returned. Otherwise, the optional 'else-expr' is evaluated and returned. If you omited 'else-expr', and the condition was false, nil is returned.` },
    'fn': { paramstring: 'name? docstring? [parameters] & expressions', docstring: `Creates a function that is optionally named and documented. You have to provide a parameters vector. Usually it would consist of any number of symbols but it can be empty. The function body is defined by 'expressions'. When a function is called, these expressions are wrapped in a 'do' form and evaluated in a child environment of the caller environment, in which the arguments are bound to the symbols you defined in the parameter vector.` },
    'quote': { paramstring: '& expressions', docstring: `Returns the expressions themselves, that is without evaluating them. This is equivalent to the single quote reader macro:\ni.e.: (= (quote x y) '(x y)` },
    'quasiquote': { paramstring: '& expressions', docstring: `Returns the expressions themselves, that is without evaluating them – unless an expression is a list starting with the symbol 'unquote'. There are reader macros for quasiquote (~) and unquote (\`).\ni.e.: (= (quasiquote x (unquote y)) ~(x \`y))` },
    'unquote': { paramstring: '& expressions', docstring: 'Unquote forms are only valid inside of quasiquote forms. (At any nesting level.)' },
    'macroexpand': { paramstring: 'list', docstring: 'If list is a macro function, that macro will be expanded and the resulting list is returned without being evaluated. This will only expand the outermost macro and leave nested macros as is.' },
    'macroexpand-all': { paramstring: 'list', docstring: 'All macro functions contained in list be expanded and the resulting list is returned without being evaluated.' },
    'try' : { paramstring : 'form catch-expression', docstring: `'(try form (catch exception-symbol exception-handling-form))' tries to evaluate 'form' and returns its value. If an error is thrown during the evaluation of 'form', the 'exception-handling-form' is evaluated instead in a new environment. In this environment, the exeption's value is bound to 'exception-symbol'`},
    'catch': { paramstring: 'exception-symbol form', docstring: `Only valid inside of a 'try' form.\n(try form (catch exception-symbol exception-handling-form))`},
    'set-interpreter-options': { paramstring: 'options-map', docstring: 'Allows you to change how the interpreter interprets. Pretty much undocumented.\ne.g.: (set-interpreter-options {"logArepInput" true "pauseEvaluation" false})' },
};

function setMonarchTokensProvider() {
    monaco.languages.setMonarchTokensProvider('schem', <ILanguage>{
        // Set defaultToken to invalid to see what you do not tokenize yet
        defaultToken: 'invalid',

        // Here goes 'stuff that I want to be blue', like special forms or built-in macros.
        special_symbols: Object.keys(specialFormsAndKeywords).concat(['defn']),

        // C# style strings - only half true!!!
        escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

        // These two are tagken from the monarch playground's javascript definition and might be misleading
        regexpctl: /[(){}\[\]\$\^|\-*+?\.]/,
        regexpesc: /\\(?:[bBdDfnrstvwWn0\\\/]|@regexpctl|c[A-Z]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4})/,

        // The main tokenizer for our languages
        tokenizer: {
            root: [

                // whitespace
                [/[ \t\r\n,]+/, 'white'],
                { include: 'comment' },

                // numbers
                [/-?\d+\.?\d*/, 'number'],

                // regexes
                // [/"([^"\\]|\\.)*$/, 'regex.invalid'],  // non-teminated string
                [/#"/, 'string.regex', '@regex'],

                // strings
                [/"([^"\\]|\\.)*$/, 'string.invalid'],  // non-teminated string
                [/"/, 'string', '@string'],

                // open braces
                [/#\(/, { token: 'delimiter.fn-shorthand', bracket: '@open', next: '@in_fn_shorthand' }],
                [/\(/, { token: 'delimiter.brace', bracket: '@open', next: '@in_list' }],
                [/\[/, { token: 'delimiter.bracket', bracket: '@open', next: '@in_vector' }],
                [/{/, { token: 'delimiter.curly', bracket: '@open', next: '@in_map' }],

                [/\D[\w*+!\-_'?<>]*/, {
                    cases: {
                        '@special_symbols': 'type.special-symbol',
                        ':.+': 'type.keyword',
                        '@default': 'type.symbol',
                    }
                }],
            ],

            comment: [
                [/;.*$/, 'comment']
            ],

            whitespace: [
                [/[ \t\r\n]+/, 'white'],
                [/\/\*/, 'comment', '@comment'],
                [/\/\/.*$/, 'comment'],
            ],

            in_list: [
                [/\)/, { token: 'delimiter.brace', bracket: '@close', next: '@pop' }],
                { include: 'root' },
            ],

            in_vector: [
                [/\]/, { token: 'delimiter.bracket', bracket: '@close', next: '@pop' }],
                { include: 'root' },
            ],

            in_map: [
                [/}/, { token: 'delimiter.curly', bracket: '@close', next: '@pop' }],
                { include: 'root' },
            ],

            in_fn_shorthand: [
                [/\)/, { token: 'delimiter.fn-shorthand', bracket: '@close', next: '@pop' }],
                [/%[0-9&]?(?=[\(\)\[\]\{\} ,])/, 'fn-shorthand.parameter'],
                [/%.+? /, 'invalid'],
                { include: 'root' },
            ],

            string: [
                [/[^\\"]+/, 'string'],
                [/@escapes/, 'string.escape'],
                [/\\./, 'invalid'],
                [/"/, 'string', '@pop']
            ],

            regex: [
                [/@regexpctl/, 'regexp.control'],
                [/@regexpesc/, 'regexp.escape'],
                [/"/, 'string.regex', '@pop'], // end quote
                [/./, 'string.regex'], // anything
            ]
        },
    });

}

function registerHoverProvider() {
    monaco.languages.registerHoverProvider('schem', {
        provideHover: (model, position) => {
            const tokenRange = getRangeOfTokenAtPosition(model, position);

            if (tokenRange != null) {
                const tokenAtPosition = model.getValueInRange(tokenRange);
                return {
                    contents: [
                        { value: '**Infos!**' },
                        { value: `Hovering over: ${tokenAtPosition}` }
                    ]
                };
            } else {
                return {
                    contents: [
                        { value: '**No infos!**' },
                        { value: 'No token found. How did that happen?' }
                    ]
                };
            }
        }
    });
}

function getRangeOfTokenAtPosition(model: monaco.editor.ITextModel, position: monaco.IPosition) {
    const lineContent = model.getLineContent(position.lineNumber);
    const lineTokens = monaco.editor.tokenize(lineContent, 'schem')[0];

    let tokenStart, tokenEnd: number | null = null;

    for (let i = 0; i < lineTokens.length; i++) {
        if (i === lineTokens.length - 1) {
            // last token
            tokenStart = lineTokens[i].offset + 1;
            tokenEnd = model.getLineMaxColumn(position.lineNumber);
        } else if (lineTokens[i].offset <= position.column && lineTokens[i + 1].offset >= position.column) {
            tokenStart = lineTokens[i].offset + 1;
            tokenEnd = lineTokens[i + 1].offset + 1;
            break;
        }
    }

    if (tokenStart != null && tokenEnd != null) {
        return new monaco.Range(position.lineNumber, tokenStart, position.lineNumber, tokenEnd);
    } else {
        return null;
    }
}

function registerCompletionItemProvider() {
    monaco.languages.registerCompletionItemProvider('schem', {
        triggerCharacters: ['.'],
        provideCompletionItems: (textModel, position, context, cancellationToken) => {
            let tokenRange = getRangeOfTokenAtPosition(textModel, new monaco.Position(position.lineNumber, position.column - 1));

            if (tokenRange == null) {
                throw new Error(`No token found at cursor position.`);
            }

            const defaultRange: monaco.IRange = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: tokenRange.startColumn,
                endColumn: tokenRange.endColumn
            };

            const tokenToComplete = textModel.getValueInRange(defaultRange);

            if (/\./.test(tokenToComplete)) {
                // the token that is to be completed contains a dot, propose javascript completion items
                return createJSCompletionItems(tokenToComplete, defaultRange);
            } else {
                // propose schem completion items
                return createSchemCompletionItems(defaultRange);
            }
        }
    });
}

/** Creates a list of completion items of all symbols currently bound in the interpreter's root environment. */
async function createSchemCompletionItems(range: monaco.IRange): Promise<monaco.languages.CompletionList> {
    const pickDocumentation = (schemValue: any) => {
        let metadata = (isSchemFunction(schemValue) && schemValue.metadata != null) ? schemValue.metadata : null;
        if (metadata != null) {
            return `[${schemValue.metadata.parameters == null ? '' : schemValue.metadata.parameters.join(' ')}]\n\n${schemValue.metadata.docstring}`;
        } else {
            return 'No documentation found.';
        }
    };

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
                return symbol.name;
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

    for (const sym in specialFormsAndKeywords) {
        reservedKeywordCompletionItems.push({
            label: sym,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: sym,
            detail: 'special form or reserved word',
            documentation: `[${specialFormsAndKeywords[sym].paramstring}]\n\n${specialFormsAndKeywords[sym].docstring}`,
            range: range
        });
    }

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
function createJSCompletionItems(token: string, tokenRange: monaco.IRange): monaco.languages.CompletionList {
    let jsCompletionItems: monaco.languages.CompletionItem[] = [];
    const jsSymbol = token;

    // find the part of the completion word that comes before the last dot
    // "aaa.bbb.ccc" -> "aaa.bbb"
    const matches = jsSymbol.match(/(.*)\.(.*)/);
    let partBeforeLastDot = (matches && matches.length > 0) ? matches[1] : null;

    if (partBeforeLastDot != null) {

        try {
            // Trying to resolving a non-existent property throws an exception, we don't care about it though.
            let obj: any = resolveJSPropertyChain(window, partBeforeLastDot);

            const properties = getAllProperties(obj);
            const typeToKind = (type: 'string' | 'number' | 'boolean' | 'symbol' | 'undefined' | 'object' | 'function' | 'bigint') => {
                // These are picked based on how much I like the icon monaco displays, not for semantic reasons.
                switch (type) {
                    case 'object': return monaco.languages.CompletionItemKind.Module;
                    case 'function': return monaco.languages.CompletionItemKind.Function;
                    default: return monaco.languages.CompletionItemKind.Variable;
                }
            };
            if (properties != null) properties.forEach(propertyName => {
                const type = typeof obj[propertyName];
                const suggestionText = `${partBeforeLastDot}.${propertyName}`;
                jsCompletionItems.push({
                    label: suggestionText,
                    commitCharacters: ['.'],
                    kind: typeToKind(type),
                    insertText: suggestionText,
                    detail: `Javascript ${type}`,
                    range: tokenRange
                });
            });
        } catch {
            // Got nothing to suggest -> got nothing to do.
        }
    }

    return { suggestions: jsCompletionItems };
}