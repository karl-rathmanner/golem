import { unescape } from './schem/reader';
import { Schem } from './schem/schem';

export interface ContextArepResponse {
    result?: string;
    error?: string;
    contextId: number;
}

(async function addInterpreter() {
    // for *some* reason, the interpreter gets injected twice when preparing a context that explicitly requested the 'schem-interpreter' feature
    // TODO: investigate
    if (window.golem == null) {
        console.warn('trying to inject interpreter before the base content script');
    } else {
        console.log('injecting interpreter');
    }

    if (window.golem.interpreter == null) {
        window.golem.features.push('schem-interpreter');
        const interpreter = new Schem();
        interpreter.loadCore();
        window.golem.interpreter = interpreter;

        if (window.golem.injectedProcedures != null) {
            window.golem.injectedProcedures.set('evalSchem', interpreter.evalSchem);
            window.golem.injectedProcedures.set('arep', async (code: string, escape: boolean) => {
                let resultOrError: ContextArepResponse = {
                    contextId: window.golem.contextId
                };

                await interpreter!.arep(code).then(result => {
                    resultOrError.result = escape ? unescape(result) : result;
                }).catch(reason => {
                    console.error(code, reason);
                    resultOrError.error = typeof reason === 'string' ? reason : JSON.stringify(reason);
                });

                return resultOrError;
            });
        }
    }
})();