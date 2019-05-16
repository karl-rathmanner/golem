import { domManipulationSchemFunctions } from './domManipulationSchemFunctions';

(function addSchemFunctions() {
    if (window.golem.features.indexOf('schem-interpreter') === -1) {
        throw new Error(`Can't inject feature 'dom-manipulation', inject 'schem-interpreter' first!`);
    }

    window.golem.interpreter!.replEnv.addMap(domManipulationSchemFunctions);
    window.golem.features.push('dom-manipulation');
})();