import { pr_str } from './schem/printer';
import { browser } from 'webextension-polyfill-ts';
import { EventPageMessage } from './eventPageMessaging';

(function addBCEToContext() {
    if (window.golem.features.indexOf('schem-interpreter') === -1) {
        throw new Error(`Can't inject feature 'background-context-requests', inject 'schem-interpreter' first!`);
    }

    window.golem.interpreter!.replEnv.addMap({
        'arep-in-bgc': {
            f: async (form: any) => {
                let stringifiedForm = await pr_str(form);
                const msg: EventPageMessage = {
                    action: 'arep-in-bgc', args: { code: stringifiedForm }
                };
                return browser.runtime.sendMessage(msg);
            },
            docstring: `Stringifies a schem form and requests its execution in the background context.`,
            paramstring: `form`
        }
    });

    window.golem.features.push('background-context-requests');
})();