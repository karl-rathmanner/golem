import { domManipulationSchemFunctions } from './domManipulationSchemFunctions';
import { Schem } from './schem/schem';
import { SchemString } from './schem/types';
import { SchemEditor } from './SchemEditor';
import { shlukerts } from './shlukerts';
import { VirtualFileSystem } from './virtualFilesystem';

window.onload = async () => {
    const interpreter = new Schem();

    // create a global golem object, so functions that were written with a content script environment in mind can be used in this background-page-ish context
    window.golem = {
        interpreter: interpreter,
        contextId: -1,
        features: ['schem-interpreter', 'shlukerts', 'dom-manipulation']
    };

    // maybe custom pages will later be handled by the context manager. until then, features are hard coded for testing purposes
    interpreter.replEnv.addMap(shlukerts);
    interpreter.replEnv.addMap(domManipulationSchemFunctions);

    // bind searchParams from the url in the Repl's root environment
    const url = new URL(window.location.href);
    url.searchParams.forEach((value, key) => {
        interpreter.replEnv.set(key, new SchemString(value));
    });

    const qualifiedFileName = window.location.hash;
    // if the url contains a hash property, load a schem script from the vfs and evaluate it
    if (qualifiedFileName != null && qualifiedFileName.length > 0) {
        const qualifiedFileName = window.location.hash.slice(1);
        VirtualFileSystem.readObject(qualifiedFileName).then(startupScript => {
            if (typeof startupScript === 'string' && startupScript.length > 0) {
                interpreter.arep(`(do ${startupScript})`);
            }

            const editorContainer = document.querySelector('#schemEditorContainer') as HTMLElement;
            if (editorContainer != null) {
                const editor = new SchemEditor(editorContainer, { interpreter: interpreter, expandContainer: false });
                editor.loadLocalFile(qualifiedFileName);
                interpreter.replEnv.addMap(editor.editorManipulationSchemFunctions);
            }

        }).catch((e) => console.error(e));
    }
};