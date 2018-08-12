import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import ILanguage = monaco.languages.IMonarchLanguage;
import { Schem } from '../schem/schem';
import { SchemList, SchemSymbol } from '../schem/types';

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
    keywords: [
      'fn',
      'def',
      'defn',
      'defmacro'
    ],
    constants: ['true', 'false', 'nil'],
    operators: ['=', 'not=', '<', '<=', '>', '>=', 'and', 'or', 'not', 'inc', 'dec', 'max', 'min', 'rem', 'bit-and', 'bit-or', 'bit-xor', 'bit-not'],
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
              '@operators': 'operators',
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
    provideCompletionItems: async (textModel, position) => {
      let wordAtCursor = textModel.getWordAtPosition(position).word;
      let symbols = await interpreter.readEval(`(sort-and-filter-by-string-similarity "${wordAtCursor}" (list-symbols))`);

      if (symbols instanceof SchemList) {
        let completionItems: monaco.languages.CompletionItem[] = symbols.map((sym: SchemSymbol) => {
          return {
            label: sym.name,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: sym.name + ' '
          };
        });
        return completionItems;
      }

      return [];
    }
  });
}