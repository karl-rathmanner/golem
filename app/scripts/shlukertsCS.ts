import { shlukerts } from './shlukerts';

(function addShlukertsToContext() {
  if (window.golem.features.indexOf('schem-interpreter') === -1) {
    throw new Error(`Can't inject feature 'tiny-repl', inject 'schem-interpreter' first!`);
  }
  
  window.golem.interpreter!.replEnv.addMap(shlukerts);
  window.golem.features.push('shlukerts');
})();