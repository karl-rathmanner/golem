import { unescape } from './schem/reader';
import { Schem } from './schem/schem';

export interface ContextArepResponse {
  result?: string;
  error?: string;
  contextId: number;
}

(function addInterpreter() {
  const interpreter = new Schem();
  window.golem.interpreter = interpreter;
  window.golem.features.push('schem-interpreter');

  if (window.golem.injectedProcedures != null) {
    window.golem.injectedProcedures.set('evalSchem', interpreter.evalSchem);
    window.golem.injectedProcedures.set('arep', async (code: string, escape: boolean) => {
      let resultOrError: ContextArepResponse = {
        contextId: window.golem.contextId
      };

      await interpreter.arep(code).then(result => {
        resultOrError.result = escape ? unescape(result) : result;
      }).catch(reason => {
        console.error(reason);
        resultOrError.error = typeof reason === 'string' ? reason : JSON.stringify(reason);
      });

      return resultOrError;
    });
  }
})();