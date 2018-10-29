import * as monaco from 'monaco-editor';
import { Schem } from '../schem/schem';
import { isSchemCollection, isSchemFunction, isSchemSymbol } from '../schem/typeGuards';
import { AnySchemType, SchemContextSymbol, SchemList, SchemSymbol, SchemTypes } from '../schem/types';
import ILanguage = monaco.languages.IMonarchLanguage;


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
  let reservedKeywordCompletionItems: monaco.languages.CompletionItem[] = [];

  specialFormsAndKeywords.forEach(kw => {
    reservedKeywordCompletionItems.push({
        label: kw,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: kw + ' ',
        detail: 'special form or reserved word'
    });
  });

  monaco.languages.registerCompletionItemProvider('schem', {
    provideCompletionItems: async (textModel, position) => {

      // let wordAtCursor = textModel.getWordAtPosition(position).word;
      // let symbols = await interpreter.readEval(`(sort-and-filter-by-string-similarity "${wordAtCursor}" (list-symbols))`);
      let symbols = await interpreter.readEval(`(list-symbols)`);
      if (symbols instanceof SchemList) {
        let completionItems: monaco.languages.CompletionItem[] = symbols.map((sym: SchemSymbol): monaco.languages.CompletionItem => {
          const resolvedValue = interpreter.replEnv.get(sym);

          const pickKind = (t: SchemTypes) => {
            // Not caring about the semantics here, just trying to pick ones with a fitting icon
            // TODO: see if CompletionItemKind can be extended or customized
            switch (t) {
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

          const pickInsertText = (symbol: SchemSymbol | SchemContextSymbol, schemValue: AnySchemType) => {
            if (isSchemSymbol(symbol)) {
              if (schemValue.typeTag === SchemTypes.SchemFunction) {
                return {
                  value: '(' + symbol.name + ' $0)'
                };
              } else {
                return symbol.name + ' ';
              }
            } else {
              return symbol.name + ': ';
            }
          };

          const pickDetail = (schemValue: AnySchemType) => {
            if (isSchemFunction(schemValue)) {
              if (schemValue.isMacro) {
                return `Macro`;
              } else {
                return `Function`;
              }
            } else if (isSchemCollection(schemValue)) {
              return `${SchemTypes[schemValue.typeTag]} with ${schemValue.count()} items`; // printing a collection would be asynchronous and might have side effects, so I won't do that for now
            } else {
              // TODO: handle keywords, atoms etc.
              return `${SchemTypes[schemValue.typeTag]}: ${schemValue.toString()}`;
            }
          };

          return {
            label: sym.name,
            kind: pickKind(resolvedValue.typeTag),
            insertText: pickInsertText(sym, resolvedValue),
            detail: pickDetail(resolvedValue)
          };
        });

        completionItems.push(...reservedKeywordCompletionItems);
        return completionItems;
      }

      return [];
    }
  });
}