import { SchemEditor } from './SchemEditor';

window.onload = () => {
    const editor = new SchemEditor(document.getElementById('monacoContainer')!, { language: 'schem', expandContainer: true });

    // if the url contains a hash property, treat it as the qualified name of a local script
    if (window.location.hash != null && window.location.hash.length > 0) {
        editor.loadLocalFile(window.location.hash.slice(1));
    }
};