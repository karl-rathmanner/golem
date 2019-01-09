import * as monaco from 'monaco-editor';
import { Schem } from '../schem/schem';
import { isSchemCollection, isSchemFunction, isSchemSymbol, isSchemType } from '../schem/typeGuards';
import { AnySchemType, SchemContextSymbol, SchemList, SchemSymbol, SchemTypes } from '../schem/types';
import ILanguage = monaco.languages.IMonarchLanguage;
import { resolveJSPropertyChain, getAllProperties } from '../javascriptInterop';


export function AddSchemSupportToEditor(interpreter: Schem) {
  registerLanguage();
  setLanguageConfiguration();
  setMonarchTokensProvider();
  registerCompletionItemProvider(interpreter);
}

export function SetInterpreterForCompletion(interpreter: Schem) {
  this.registerCompletionItemProvider(interpreter);
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
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '{', close: '}' },
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
  'quote', 'quasiquote', 'macroexpand', 'macroexpand-all', 'set-interpreter-options',
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

function registerCompletionItemProvider(interpreter: Schem) {
  monaco.languages.registerCompletionItemProvider('schem', {
    triggerCharacters: ['.'],
    provideCompletionItems: async (textModel, position, token, context) => {

      // Completion was triggered by the user typing a dot -> propose javascript completion items
      if (context.triggerCharacter == '.') {
        return createJSCompletionItems(textModel, position);
      } else {
        // propose schem completion items
        return createSchemCompletionItems(interpreter);
      }
    }
  });
}

/** Creates a list of completion items of all symbols currently bound in the interpreter's root environment. */
async function createSchemCompletionItems(interpreter: Schem) {

  /** Turns a single schem symbol into a completion item with runtime information */
  function schemSymbolToCompletionItem (sym: SchemSymbol): monaco.languages.CompletionItem {
    const resolvedValue: any = interpreter.replEnv.get(sym);
  
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
          return {
            value: symbol.name + ' '
          };
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
        if (typeof value === 'object') return `${typeof value}: ${("toString" in value) ? value.toString() : value}`;
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
      detail: pickDetail(resolvedValue)
    };
  };

  // Create completion items for built-in keywords
  let reservedKeywordCompletionItems: monaco.languages.CompletionItem[] = [];

  specialFormsAndKeywords.forEach(kw => {
    reservedKeywordCompletionItems.push({
        label: kw,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: kw + ' ',
        detail: 'special form or reserved word'
    });
  });

  // Get all symbols bound in the interpreter's root environment
  let symbols = await interpreter.readEval(`(list-symbols)`);
  if (symbols instanceof SchemList) {
    const completionItems: monaco.languages.CompletionItem[] = symbols.map(schemSymbolToCompletionItem);
    return completionItems.concat(reservedKeywordCompletionItems);
  } else {
    // Environment contains no symbols, which would be weird. Let's not make a scene about it...
    return reservedKeywordCompletionItems;
  }
}



/** Handles completion for js-symbols by looking up object properties in the current editor environment at runtime. 
 * TODO: Add special case for foreign execution context forms? (By looking up properties in foreign js contexts.)
*/
function createJSCompletionItems(textModel: monaco.editor.ITextModel, position: monaco.Position) {
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
      const properties = getAllProperties(obj)
      const typeToKind = (type: 'string' | 'number' | 'boolean' | 'symbol' | 'undefined' | 'object' | 'function' | 'bigint') => {
        // these are picked based for the icon monaco displays, not for semantic reasons
        switch (type) {
          case 'object' : return monaco.languages.CompletionItemKind.Module;
          case 'function': return monaco.languages.CompletionItemKind.Function;
          default: return monaco.languages.CompletionItemKind.Variable;
        }
      }
      if (properties != null) properties.forEach(propertyName => {
        const type = typeof obj[propertyName];

        jsCompletionItems.push({
          label: propertyName,
          commitCharacters: ['.'],
          kind: typeToKind(type),
          insertText: propertyName,
          detail: `Javascript ${type}`,
        });
      })
    }
  }

  return jsCompletionItems;
}