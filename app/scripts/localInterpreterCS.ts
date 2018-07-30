
import { browser, Runtime } from 'webextension-polyfill-ts';
import { ContextMessage } from './baseContentScript';
import { Schem } from './schem/schem';

(function addSomeDemoProcedures() {
  const interpreter = new Schem();
  window.golem.interpreter = interpreter;
  window.golem.injectedProcedures.set('evalSchem', interpreter.evalSchem);
  window.golem.injectedProcedures.set('arep', (code: string) => {
    return interpreter.arep(code);
  });
})();