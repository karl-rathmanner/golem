import { TinyRepl } from './tinyRepl';

(function addTinyReplToContext() {
    if (window.golem.features.indexOf('schem-interpreter') === -1) {
        throw new Error(`Can't inject feature 'tiny-repl', inject 'schem-interpreter' first!`);
    }

    const tinyRepl = new TinyRepl();

    window.golem.interpreter!.replEnv.addMap({
        'tiny-repl-show': async () => {
            tinyRepl.showInputBox();
        },
        'tiny-repl-hide': async () => {
            tinyRepl.hideinputBox();
        }
    });

    window.golem.features.push('tiny-repl');
})();