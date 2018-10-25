import { SchemContextInstance, SchemContextDefinition } from './schem/types';
import { browser, Tabs } from 'webextension-polyfill-ts';
import { GolemContextMessage } from './contentScriptMessaging';
import { objectPatternMatch } from './utils/utilities';
import { pr_str } from './schem/printer';


export type AvailableSchemContextFeatures = 'schem-interpreter' | 'lightweight-js-interop' | 'demo-functions' | 'dom-manipulation' | 'tiny-repl' | 'shlukerts';

export class SchemContextManager {
  activeContextInstances = new Map<number, SchemContextInstance>();
  private static featureNameToContentScriptPath = new Map<AvailableSchemContextFeatures, string>([
    ['schem-interpreter', 'scripts/localInterpreterCS.js'],
    ['demo-functions', 'scripts/demoContentScript.js'],
    ['lightweight-js-interop', 'scripts/lightweightJavascriptInterop.js'],
    ['dom-manipulation', 'scripts/domManipulationSchemFunctions.js'],
    ['tiny-repl', 'scripts/tinyReplCS.js'],
    ['shlukerts', 'scripts/shlukertsCS.js']
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
      const matchingContextId = this.idOfContextInstanceMatchingPattern({frameId: frameId, tabId: tabId, windowId: windowId, tabQuery: queryInfo});

      if (matchingContextId === null) {
        if (contextDef.lifetime == null) contextDef.lifetime = 'inject-once';
        const newContext = new SchemContextInstance(this.getNewContextId(), tabId, windowId, contextDef);
        this.activeContextInstances.set(newContext.id, newContext);
        return newContext;
      } else {
        return this.activeContextInstances.get(matchingContextId)!;
      }
    });

    const contextIds = Promise.all(contexts.map(async context => {
      await this.injectBaseContentScriptIfNecessary(context);

      if (contextDef.features != null) {
        await Promise.all(contextDef.features.map((feature) => {
          this.injectFeatureIfNecessary(context, feature as AvailableSchemContextFeatures);
        }));
      }

      return context.id;
    }));

    return contextIds;
  }

  private async injectBaseContentScriptIfNecessary(context: SchemContextInstance) {
    if (!(await this.hasActiveBaseContentScript(context))) {
      if (!(await this.injectBaseContentScript(context))) {
        throw new Error(`couldn't inject base content script into context ${context.id}`);
      }
    }
  }

  /** Get a pseudo-random integer that isn't currently used as a context ID */
  getNewContextId() {
    let candidateId: number;
    do {
      candidateId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    } while (this.hasContextInstance(candidateId));
    return candidateId;
  }

  idOfContextInstanceMatchingPattern(pattern: any, ignorePropertiesNamed: string[] = []) {
    for (const context of this.activeContextInstances.values()) {
      if (objectPatternMatch(context, pattern)) {
        return context.id;
      }
    }
    return null;
  }

  getContextInstance(contextId: number): SchemContextInstance {
    const c = this.activeContextInstances.get(contextId);
    if (c == null) {
      throw new Error(`no context found for id ${contextId}`);
    }
    return c;
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
      return true;
    }).catch(e => e);
  }

  async injectFeatureIfNecessary(context: SchemContextInstance, feature: AvailableSchemContextFeatures) {
    const hasFeature = await this.checkFeature(context, feature);
    if (!hasFeature) {
      return this.injectFeature(context, feature);
    }
    return true;
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
      // console.log(`context ${context.id} ${result === true ? 'supports' : `doesn't support`} ${feature}`);
      return result as boolean;
    }).catch(reason => {
      throw new Error(reason.message);
    });
  }

  async arepInContexts(contextIds: number[], schemCode: string, options?: any) {
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

  async restoreContextsAfterReload(tabId: number) {
    const contextsInTab = Array.from(this.activeContextInstances.values()).filter(ci => {
      return ci.tabId === tabId;
    });

    contextsInTab.forEach(async context => {
      if (context.definition.lifetime === 'persistent') {
        await this.injectBaseContentScriptIfNecessary(context);
        if (context.definition.features != null) context.definition.features.forEach(feature => {
          this.injectFeatureIfNecessary(context, feature);
        });
        if (context.definition.init != null) {
          this.arepInContexts([context.id], await pr_str(await context.definition.parentContext!.evalSchem(context.definition.init)));
        }
      } else {
        // this context is not needed anymore
        this.activeContextInstances.delete(context.id);
      }
    });
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