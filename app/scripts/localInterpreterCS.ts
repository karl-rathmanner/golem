
import { browser, Runtime } from 'webextension-polyfill-ts';
import { ContextMessage } from './baseContentScript';
import { Schem } from './schem/schem';
import { unescape } from './schem/reader';

(function addSomeDemoProcedures() {
  const interpreter = new Schem();
  window.golem.interpreter = interpreter;
  window.golem.injectedProcedures.set('evalSchem', interpreter.evalSchem);
  window.golem.injectedProcedures.set('arep', async (code: string, escape: boolean) => {
    if (escape) {
      return unescape(await interpreter.arep(code));
    } else {
      return interpreter.arep(code);
    }
  });
})();