import { SchemEditor } from './SchemEditor';

window.onload = () => {
  new SchemEditor(document.getElementById('monacoContainer')!);
};