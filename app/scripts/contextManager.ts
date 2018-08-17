import { SchemContextInstance, SchemContextDefinition } from './schem/types';
import { browser, Tabs } from 'webextension-polyfill-ts';
import { GolemContextMessage } from './contentScriptMessaging';
import { objectPatternMatch } from './utils/utilities';


export type AvailableSchemContextFeatures = 'schem-interpreter' | 'lightweight-js-interop' | 'demo-functions' | 'dom-manipulation' | 'tiny-repl';

export class SchemContextManager {
  activeContextInstances = new Array<SchemContextInstance>();
  private static featureNameToContentScriptPath = new Map<AvailableSchemContextFeatures, string>([
    ['schem-interpreter', 'scripts/localInterpreterCS.js'],
    ['demo-functions', 'scripts/demoContentScript.js'],
    ['lightweight-js-interop', 'scripts/lightweightJavascriptInterop.js'],
    ['dom-manipulation', 'scripts/domManipulationSchemFunctions.js'],
    ['tiny-repl', 'scripts/tinyReplCS.js']
  ]);

  constructor() {
  }

  /** Basic content script setup - creates the global golem object and enables listening for messages. */
  async injectBaseContentScript(contextOrContextId: number | SchemContextInstance): Promise<boolean> {
    let contextInstance = (typeof contextOrContextId === 'number') ? this.getContextInstance(contextOrContextId) : contextOrContextId;

    if (contextInstance === null) {
      return Promise.reject('invalid contextId!');
    }

    // inject a global golem object that content scripts can share
    await browser.tabs.executeScript(contextInstance.tabId, {
      code: `
        var golem = {contextId: ${contextInstance.id}};
        golem.injectedProcedures = new Map();
        `,
      // frameId: contextInstance.definition.frameId
    }).catch(e => {
      console.error(e);
      return Promise.reject(`Couldn't inject golem object`);
    });

    // inject actual content script
    await browser.tabs.executeScript(contextInstance.tabId,
      {
        file: 'scripts/baseContentScript.js',
        // frameId: contextInstance.definition.frameId
      }).catch(e => {
        console.error(e);
        Promise.reject(`Couldn't inject base content script`);
    });

    contextInstance.baseContentScriptIsLoaded = true;

    return true; // success?

  }

  /** Creates new context instances if necessary, adds them to the registry and returns their ids */
  async prepareContexts(contextDef: SchemContextDefinition): Promise<number[]> {
    const queryInfo: Tabs.QueryQueryInfoType = contextDef.tabQuery;
    const frameId: number | undefined = contextDef.frameId;

    let tabs;

    try {
      tabs = await browser.tabs.query(queryInfo);
    } catch (e) {
      // reject with a plain object - the actual value of 'e' can't be jsonified, I guess. (at least it won't work for *some* reason...)
      return Promise.reject({error: {message: e.message}});
    }

    // get contexts that match the description, create new ones as necessary
    const contexts = tabs.map(tab => {
      const windowId = typeof tab.windowId !== 'undefined' ? tab.windowId : -1;
      const tabId = typeof tab.id !== 'undefined' ? tab.id : -1;

      // instantiate new context only if the frame>tab>window doesn't already have one matching the definition
      const matchingContextIndex = this.indexOfContextInstanceMatchingPattern({frameId: frameId, tabId: tabId, windowId: windowId, tabQuery: queryInfo});

      if (matchingContextIndex < 0) {
        const newContext = new SchemContextInstance(this.getNewContextId(), tabId, windowId, {tabQuery: queryInfo, frameId: frameId, lifetime: 'inject-once'});
        this.activeContextInstances.push(newContext);
        return newContext;
      } else {
        return this.activeContextInstances[matchingContextIndex];
      }
    });

    const contextIds = Promise.all(contexts.map(async context => {
      if (! (await this.hasActiveBaseContentScript(context))) {
        if (!(await this.injectBaseContentScript(context))) {
          throw new Error(`couldn't inject base content script into context ${context.id}`);
        }
      }

      if (contextDef.features != null) {
        await Promise.all(contextDef.features.map((feature) => {
          this.injectFeatureIfNecessary(context, feature as AvailableSchemContextFeatures);
        }));
      }

      return context.id;
    }));

    return contextIds;
  }

  /** Get a pseudo-random integer that isn't currently used as a context ID */
  getNewContextId() {
    let candidateId: number;
    do {
      candidateId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    } while (this.hasContextInstance(candidateId));
    return candidateId;
  }

  indexOfContextInstanceMatchingPattern(pattern: any, ignorePropertiesNamed: string[] = []) {
    return this.activeContextInstances.findIndex(context => {
      return objectPatternMatch(context, pattern);
    });
  }

  getContextInstance(contextId: number): SchemContextInstance {
    const index = this.activeContextInstances.findIndex(instance => instance.id === contextId);
    if (index === -1) {
      throw new Error(`no context found for id ${contextId}`);
    }
    return this.activeContextInstances[index];
  }

  hasContextInstance(contextId: number): boolean {
    try {
      this.getContextInstance(contextId);
      return true;
    } catch {
      return false;
    }
  }

  async injectFeature(context: SchemContextInstance, feature: AvailableSchemContextFeatures) {
    const contentScriptURL = SchemContextManager.featureNameToContentScriptPath.get(feature);
    return browser.tabs.executeScript(context.tabId, {file: contentScriptURL}).then(result => {
      console.log(result);
      return true;
    }).catch(e => e);
  }

  async hasActiveBaseContentScript(context: SchemContextInstance): Promise<boolean> {
    const msg: GolemContextMessage = {action: 'has-base-content-script'};
    return browser.tabs.sendMessage(context.tabId, msg).then(result => {
      return result;
    }).catch(r => {
      // Sending the message will fail if there is no active content script in the adressed tab.
      return false;
    });
  }

  async checkFeature(context: SchemContextInstance, feature: AvailableSchemContextFeatures): Promise<boolean> {
    const msg: GolemContextMessage = {action: 'has-feature', args: feature};
    return browser.tabs.sendMessage(context.tabId, msg).then(result => {
      console.log(`context ${context.id} ${result === true ? 'supports' : `doesn't support`} ${feature}`);
      return result as boolean;
    }).catch(reason => {
      throw new Error(reason.message);
    });
  }

  async injectFeatureIfNecessary(context: SchemContextInstance, feature: AvailableSchemContextFeatures) {
    const hasFeature = await this.checkFeature(context, feature);
    if (!hasFeature) {
      return this.injectFeature(context, feature);
    }
    return true;
  }

  async arepInContexts(contextIds: number[], schemCode: string, options: any) {
    const contexts = contextIds.map(id => this.getContextInstance(id));
    // inject interpreter where necessary
    await Promise.all(contexts.map(async context => this.injectFeatureIfNecessary(context, 'schem-interpreter')));

    // send arep messages
    const tabIds: Array<number> = contextIds.map((contextId: number) => this.getContextInstance(contextId)!.tabId);
    return await Promise.all(tabIds.map(async tabId => {
        return browser.tabs.sendMessage(tabId, {
          action: 'invoke-context-procedure',
          args: {
            procedureName: 'arep',
            procedureArgs: [schemCode, options]
          }
        });
      })
    );

  }


  async invokeJsProcedure(contextIds: number[], qualifiedProcedureName: string, ...procedureArgs: any[]) {
    // NOT DRY!
    const contexts = contextIds.map(id => this.getContextInstance(id));
    // inject interpreter where necessary
    await Promise.all(contexts.map(async context => this.injectFeatureIfNecessary(context, 'lightweight-js-interop')));

    const tabIds: Array<number> = contextIds.map((contextId: number) => this.getContextInstance(contextId)!.tabId);
    const resultsAndReasons = await Promise.all(
      tabIds.map(async tabId => {
        return browser.tabs.sendMessage(tabId, {
          action: 'invoke-js-procedure',
          args : {
            qualifiedProcedureName : qualifiedProcedureName,
            procedureArgs: procedureArgs
          }
        });
      })
    );

    return resultsAndReasons;
  }

  async getJsProperty(contextIds: number[], qualifiedPropertyName: string) {
    // STILL NOT DRY!
    const contexts = contextIds.map(id => this.getContextInstance(id));
    // inject interpreter where necessary
    await Promise.all(contexts.map(async context => this.injectFeatureIfNecessary(context, 'lightweight-js-interop')));

    const tabIds: Array<number> = contextIds.map((contextId: number) => this.getContextInstance(contextId)!.tabId);
    const resultsAndReasons = await Promise.all(
      tabIds.map(async tabId => {
        return browser.tabs.sendMessage(tabId, {
          action: 'get-js-property',
          args : [qualifiedPropertyName]
        });
      })
    );

    return resultsAndReasons;
  }
}