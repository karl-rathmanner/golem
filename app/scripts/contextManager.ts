import { SchemContextInstance, SchemContextDefinition } from './schem/types';
import { browser, Tabs } from '../../node_modules/webextension-polyfill-ts';

export class SchemContextManager {
  activeContextInstances = new Array<SchemContextInstance>();

  constructor() {
  }

  /** Basic content script setup - creates the global golem object and enables listening for messages. */
  async injectBaseContentScript(contextId: number): Promise<boolean> {
    let contextInstance = this.getContextInstanceById(contextId);

    if (contextInstance === null) {
      return Promise.reject('invalid contextId!');
    }

    if (contextInstance.baseContentScriptIsLoaded) {
      console.log('context was already setup.', contextInstance.definition);
      return Promise.resolve(true);
    }

    // inject a global golem object that content scripts can share
    await browser.tabs.executeScript(contextInstance.definition.tabId, {
      code: `
        var golem = {contextId: ${contextId}};
        golem.injectedProcedures = new Map();
        `,
      frameId: contextInstance.definition.frameId
    }).catch(e => {
      console.error(e);
      return Promise.reject(`Couldn't inject base content script`);
    });

    // inject actual content script
    // TODO: modularize content scripts and inject specific parts only when needed
    await browser.tabs.executeScript(contextInstance.definition.tabId, {file: 'scripts/baseContentScript.js', frameId: contextInstance.definition.frameId}).catch(e => {
      console.error(e);
      Promise.reject(`Couldn't inject base content script`);
    });

    contextInstance.baseContentScriptIsLoaded = true;

    return true; // success?

  }

  /** Creates new context instances if necessary, adds them to the registry and returns their ids */
  async createContexts(queryInfo: Tabs.QueryQueryInfoType, frameId: number): Promise<number[]> {

    let tabs;

    try {
      tabs = await browser.tabs.query(queryInfo);
    } catch (e) {
      // reject with a plain object - the actual value of 'e' can't be jsonified, I guess. (at least it won't work for *some* reason...)
      return Promise.reject({error: {message: e.message}});
    }

    return tabs.map(tab => {

      const newContextDefinition: SchemContextDefinition = {
        contextId: this.getNewContextId(),
        windowId: typeof tab.windowId !== 'undefined' ? tab.windowId : -1,
        tabId: typeof tab.id !== 'undefined' ? tab.id : -1,
        frameId: frameId,
        lifetime: 'inject-once'
      };

      // instantiate new context only if none of the active ones matched the definition
      const matchingContextIndex = this.findIndexOfContextInstance(newContextDefinition, ['contextId']);

      if (matchingContextIndex < 0) {
        this.activeContextInstances.push(new SchemContextInstance(newContextDefinition));
        return newContextDefinition.contextId;
      } else {
        return this.activeContextInstances[matchingContextIndex].definition.contextId;
      }
    });
  }

  /** Get a pseudo-random integer that isn't currently used as a context ID */
  getNewContextId() {
    let candidateId: number;
    do {
      candidateId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    } while (this.getContextInstanceById(candidateId) != null);
    return candidateId;
  }

  findIndexOfContextInstance(contextDefinitionNeedle: any, ignorePropertiesNamed: string[] = []) {
    const needleProperties = Object.getOwnPropertyNames(contextDefinitionNeedle);

    return this.activeContextInstances.findIndex(context => {
      const invertedMatch = needleProperties.findIndex(needleProperty => {
        // don't check for ignored properties
        if (ignorePropertiesNamed.length > 0 && ignorePropertiesNamed.indexOf(needleProperty) !== -1) {
          return false;
        }
        // return true for the first two properties that don't match
        return (!(needleProperty in context.definition) ||
               ((context.definition as any)[needleProperty] !== (contextDefinitionNeedle as any)[needleProperty]));
      });

      // return true if none of the properties were unequal
      // (meaning: keep on looking until you found an instance that matches all of the needle's properties)
      return (invertedMatch === -1);
    });
  }

  getContextInstanceById(contextId: number): SchemContextInstance | null {
    const index = this.findIndexOfContextInstance({contextId: contextId});
    if (index === -1) {
      return null;
    }
    return this.activeContextInstances[this.findIndexOfContextInstance({contextId: contextId})];
  }
}