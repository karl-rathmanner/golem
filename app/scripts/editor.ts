import * as monaco from 'monaco-editor';
import { AddSchemSupportToEditor } from './monaco/schemLanguage';
import { Schem } from './schem/schem';
const example = require('!raw-loader!./schemScripts/example.schem');

window.onload = () => {

  AddSchemSupportToEditor(new Schem());

  let editor = monaco.editor.create(document.getElementById('monacoContainer')!, {
    value: example,
    language: 'schem',
    theme: 'vs-dark'
  });

  editor.focus();
};