import { browser, Tabs } from 'webextension-polyfill-ts';
import { SchemContextDefinition, SchemMap, SchemList, SchemSymbol, AnySchemType } from './schem/types';
import { schemToJs } from './javascriptInterop';
import { GolemContextMessage } from './contentScriptMessaging';

/// message type definitions

export type EventPageActionName =
    'create-contexts' | 'forward-context-action' | 'invoke-context-procedure' | 'invoke-js-procedure' | 'set-js-property' |
    'inject-interpreter' | 'arep-in-contexts' | 'notify' | 'execute-run-commands' | 'reload-golem' | 'arep-in-bgc';

export type EventPageMessage = {
    action: EventPageActionName,
    args?: any
    contextIds?: Array<number>,
    contextMessage?: GolemContextMessage
};

/// messaging functions

async function requestContextCreation(queryInfo: Tabs.QueryQueryInfoType, frameId: number): Promise<Array<SchemContextDefinition>> {
    return browser.runtime.sendMessage({
        action: 'create-contexts',
        recipient: 'backgroundPage',
        args: { queryInfo: queryInfo, frameId: frameId }
    }).then(value => {
        if ('error' in value) {
            // messaging worked, but something happened during context creation
            return Promise.reject(value.error.message);
        } else {
            return Promise.resolve(value);
        }
    });
}

async function requestContextAction(message: EventPageMessage) {
    let result = await browser.runtime.sendMessage(message);
    console.log(`result of context action `, result);
    return new SchemList(...result);
}

/// Schem functions

/** All of these functions send some kind of request to the event page (which in turn might relay the request to another context) */
/// ...AND ALL OF THESE ARE BROKEN IN THIS COMMIT!
/// TODO: fix later.
export const eventPageMessagingSchemFunctions = {
    'create-contexts': async (queryInfo: SchemMap, frameId?: number) => {
        return requestContextCreation(schemToJs(queryInfo, { keySerialization: 'noPrefix' }), frameId ? frameId.valueOf() : 0).then(contextsOrError => {
            return new SchemList(...contextsOrError);
        });
    },
    'invoke-context-procedure': async (contexts: SchemList, procedureName: SchemSymbol, ...procedureArgs: AnySchemType[]) => {
        return new SchemList(...await requestContextAction({
            contextIds: schemToJs(contexts),
            action: 'forward-context-action',
            contextMessage: {
                action: 'invoke-context-procedure',
                args: {
                    procedureName: procedureName.name,
                    procedureArgs: procedureArgs.map(arg => schemToJs(arg))
                }
            }
        }));
    },
    'invoke-js-procedure': async (contexts: SchemList, qualifiedProcedureName: SchemSymbol, ...procedureArgs: AnySchemType[]) => {
        return new SchemList(...await requestContextAction({
            contextIds: schemToJs(contexts),
            action: 'forward-context-action',
            contextMessage: {
                action: 'invoke-js-procedure',
                args: {
                    qualifiedProcedureName: qualifiedProcedureName.name,
                    procedureArgs: procedureArgs.map(arg => schemToJs(arg))
                }
            }
        }));
    },
    'set-js-property': async (contexts: SchemList, qualifiedPropertyName: SchemSymbol, value: AnySchemType) => {
        return new SchemList(...await requestContextAction({
            contextIds: schemToJs(contexts),
            action: 'forward-context-action',
            contextMessage: {
                action: 'set-js-property',
                args: {
                    qualifiedPropertyName: qualifiedPropertyName.name,
                    value: schemToJs(value)
                }
            }
        }));
    },
    'inject-interpreter': async (contexts: SchemList, importsOrOptionsOrSomething: AnySchemType) => {
        return new SchemList(...await requestContextAction({
            contextIds: schemToJs(contexts),
            action: 'inject-interpreter'
        }));
    },
    'arep-in-contexts': async (contexts: SchemList, code: string, options?: AnySchemType) => {
        return new SchemList(...await requestContextAction({
            contextIds: schemToJs(contexts),
            action: 'arep-in-contexts',
            args: {
                code: code,
                options: options
            }
        }));
    }
};