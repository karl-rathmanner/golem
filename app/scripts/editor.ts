
// only import a subset of monaco (as specified by the MonacoWebpackPlugin configurartion)
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

window.onload = () => {
  monaco.editor.create(document.getElementById('monacoContainer')!, {
    value: '{msg: "Hello World"}',
    language: 'json',
    theme: 'vs-dark'
  });
};