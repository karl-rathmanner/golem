import { browser, Tabs } from 'webextension-polyfill-ts';
import { GolemContextMessage } from './contentScriptMessaging';
import { pr_str } from './schem/printer';
import { isSchemNil } from './schem/typeGuards';
import { SchemContextDefinition, SchemContextInstance } from './schem/types';
import { objectPatternMatch } from './utils/utilities';
import { GlobalGolemState } from './GlobalGolemState';

export type AvailableSchemContextFeatures = 'schem-interpreter' | 'lightweight-js-interop' | 'demo-functions' | 'dom-manipulation' | 'tiny-repl' | 'shlukerts';

/** Responsible for the creating, initializing and keeping track of contexts and their features. */
export class SchemContextManager {
  contextInstanceCache = new Map<number, SchemContextInstance>();

  /** Maps feature names to bundled content scripts which will be injected on demand. */
  private static featureNameToContentScriptPath = new Map<AvailableSchemContextFeatures, string>([
    ['schem-interpreter', 'scripts/localInterpreterCS.js'],
    ['demo-functions', 'scripts/demoContentScript.js'],
    ['lightweight-js-interop', 'scripts/lightweightJavascriptInterop.js'],
    ['dom-manipulation', 'scripts/domManipulationCS.js'],
    ['tiny-repl', 'scripts/tinyReplCS.js'],
    ['shlukerts', 'scripts/shlukertsCS.js']
  ]);

  constructor() {
  }

  async refreshContextInstanceCache() {
    const thawedContextInstances = await GlobalGolemState.loadObject<Array<SchemContextInstance>>('previouslyActiveContextInstances');
    if (thawedContextInstances != null) {
      thawedContextInstances.forEach(element => this.contextInstanceCache.set(element.id, element));
      await this.removeUnloadedContextsFromCache();
      // console.log(`Thawed ${thawedContextInstances.length} context instances, removed ${thawedContextInstances.length - this.contextInstanceCache.size} that were superfluous.`)
    } else {
      // console.log(`No context instances to be thawed.`)
    }
  }

  async persistContextInstanceCache() {
    const instances = Array.from(this.contextInstanceCache.values());
    await GlobalGolemState.saveObject<Array<SchemContextInstance>>('previouslyActiveContextInstances', instances);
    console.log(`saved ${instances.length} context instances`)
  }

  /** Basic content script setup - creates the global golem object and enables listening for messages. */
  async injectBaseContentScript(contextOrContextId: number | SchemContextInstance): Promise<boolean> {
    let contextInstance = (typeof contextOrContextId === 'number') ? this.getContextInstanceFromCache(contextOrContextId) : contextOrContextId;

    if (contextInstance === null) {
      return Promise.reject('invalid contextId!');
    }

    // inject a global golem object that content scripts can share
    await browser.tabs.executeScript(contextInstance.tabId, {
      code: `
        var golem = {contextId: ${contextInstance.id}, features:[]};
        golem.injectedProcedures = new Map();
        `,
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
  async prepareContexts(contextDef: SchemContextDefinition, restrictToTabId?: number): Promise<number[]> {
    const queryInfo: Tabs.QueryQueryInfoType = contextDef.tabQuery;
    const frameId: number | undefined = contextDef.frameId;

    let tabs;

    try {
      tabs = await browser.tabs.query(queryInfo);
    } catch (e) {
      // reject with a plain object - the actual value of 'e' can't be jsonified, I guess. (at least it won't work for *some* reason...)
      return Promise.reject({error: {message: e.message}});
    }

    if (restrictToTabId != null) {
      tabs = tabs.filter(tab => tab.id === restrictToTabId);
    }

    await this.refreshContextInstanceCache();

    // get contexts that match the description, create new ones as necessary
    const contexts = tabs.map(tab => {
      const windowId = typeof tab.windowId !== 'undefined' ? tab.windowId : -1;
      const tabId = typeof tab.id !== 'undefined' ? tab.id : -1;

      // instantiate new context only if the frame>tab>window doesn't already have one matching the definition
      const matchingContextId = this.idOfContextInstanceMatchingPattern(
        {
          frameId: frameId, 
          tabId: tabId, 
          windowId: windowId, 
          definition: {
            tabQuery: queryInfo
          }
        });

      if (matchingContextId === null) {
        if (contextDef.lifetime == null) {
          contextDef.lifetime = 'inject-once';
        }
        const newContext = new SchemContextInstance(this.getNewContextId(), tabId, windowId, contextDef);
        this.contextInstanceCache.set(newContext.id, newContext);
        this.persistContextInstanceCache();

        return newContext;
      } else {
        return this.contextInstanceCache.get(matchingContextId)!;
      }
    });

    const contextIds = await Promise.all(contexts.map(async context => {
      await this.setupContext(context);
      return context.id;
    }));
    
    return contextIds;
  }
  
  private async setupContext(context: SchemContextInstance) {    
    await this.injectBaseContentScriptIfNecessary(context);
  
    if (context.definition.features != null) {
      for (const feature of context.definition.features) {
        await this.injectFeatureIfNecessary(context, feature as AvailableSchemContextFeatures);
      }
    }

    if (context.definition.init != null && !isSchemNil(context.definition.init)) {
      await this.arepInContexts([context.id], await pr_str(await context.definition.parentContext!.evalSchem(context.definition.init)));
    }

    return true;
  }

  private async injectBaseContentScriptIfNecessary(context: SchemContextInstance) {
    if (!(await this.isBaseContentScriptInjected(context))) {
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
    } while (this.contextInstanceExistsInCache(candidateId));
    return candidateId;
  }

  /** Returns the first ID of a context that matches the pattern object. Make sure the cache is up to date before calling this function.*/
  idOfContextInstanceMatchingPattern(pattern: any) {
    for (const context of this.contextInstanceCache.values()) {
      if (objectPatternMatch(context, pattern)) {
        return context.id;
      }
    }
    return null;
  }

  /** Returns the IDs of all contexts that contain all key value pairs of the pattern object. */
  async getMatchingContextIdsFromCache(pattern: any) {
    await this.refreshContextInstanceCache();
    const keys = Array.from(this.contextInstanceCache.keys());
    return keys.filter(key => objectPatternMatch(this.contextInstanceCache.get(key), pattern));
  }

  /** Returns a context instance. Make sure the cache is up to date before calling this function. */
  private getContextInstanceFromCache(contextId: number): SchemContextInstance {
    const c = this.contextInstanceCache.get(contextId);
    if (c == null) {
      throw new Error(`no context found for id ${contextId}`);
    }
    return c;
  }

  public async getContextInstance(contextId: number) {
    await this.refreshContextInstanceCache();
    return this.getContextInstanceFromCache(contextId);
  }

  public async getAllActiveContextIds() {
    await this.refreshContextInstanceCache();
    return Array.from(this.contextInstanceCache.keys());
  }

  /** Returns true if a context with the supplied ID exists. */
  private contextInstanceExistsInCache(contextId: number): boolean {
    try {
      this.getContextInstanceFromCache(contextId);
      return true;
    } catch {
      return false;
    }
  }

  /** Adds some functionality to a Schem context by injecting a content script into the appropriate tab. */
  async injectFeature(context: SchemContextInstance, feature: AvailableSchemContextFeatures) {
    const contentScriptURL = SchemContextManager.featureNameToContentScriptPath.get(feature);
    return browser.tabs.executeScript(context.tabId, {file: contentScriptURL}).then(() => {
      return true;
    }).catch(e => e);
  }

  /** Adds some functionality to a Schem context only if it is currently missing the feature. */
  async injectFeatureIfNecessary(context: SchemContextInstance, feature: AvailableSchemContextFeatures) {
    const hasFeature = await this.checkFeature(context, feature);
    if (!hasFeature) {
      return this.injectFeature(context, feature);
    }
    return true;
  }

  /** Returns true if the base content script was already injected into the tab. */
  async isBaseContentScriptInjected(context: SchemContextInstance): Promise<boolean> {
    const msg: GolemContextMessage = {action: 'has-base-content-script'};
    return browser.tabs.sendMessage(context.tabId, msg).then(result => {
      return result;
    }).catch(r => {
      // Sending the message will fail if there is no active content script in the adressed tab.
      return false;
    });
  }

  
    /** Returns true if the base content script was already injected into the tab. */
    async isContextInjected(context: SchemContextInstance): Promise<boolean> {
      const msg: GolemContextMessage = {action: 'has-context-with-id', args: {id: context.id}};
      return browser.tabs.sendMessage(context.tabId, msg).then(result => {
        return result;
      }).catch(r => {
        // Sending the message will fail if there is no active content script in the adressed tab.
        return false;
      });
    }

  /** Returns true if a given feature was already set-up for a given context. */
  async checkFeature(context: SchemContextInstance, feature: AvailableSchemContextFeatures): Promise<boolean> {
    const msg: GolemContextMessage = {action: 'has-feature', args: feature};
    return browser.tabs.sendMessage(context.tabId, msg).then(result => {
      // console.log(`context ${context.id} ${result === true ? 'supports' : `doesn't support`} ${feature}`);
      return result as boolean;
    }).catch(reason => {
      throw new Error(reason.message);
    });
  }

  /** Executes a Schem script in a particular context, sets up an interpreter instance if necessary. */
  async arepInContexts(contextIds: number[], schemCode: string, options?: any) {
    const contexts = contextIds.map(id => this.getContextInstanceFromCache(id));
    // inject interpreter where necessary
    await Promise.all(contexts.map(async context => this.injectFeatureIfNecessary(context, 'schem-interpreter')));

    // send arep messages
    const tabIds: Array<number> = contextIds.map((contextId: number) => this.getContextInstanceFromCache(contextId)!.tabId);
    return await Promise.all(tabIds.map(async tabId => {
      return browser.tabs.sendMessage(tabId, {
        action: 'invoke-context-procedure',
        args: {
          procedureName: 'arep',
          procedureArgs: [schemCode, options]
        }
      });
    }));

  }

  /** Restores all persistent contexts after their tabs were reloaded. Deletes unused conext instances. */
  async restoreContextsAfterReload(tabId: number) {
    await this.refreshContextInstanceCache();
    const contextsInTab = Array.from(this.contextInstanceCache.values()).filter(ci => {
      return ci.tabId === tabId;
    });

    for (const context of contextsInTab) {
      if (context.definition.lifetime === 'persistent') {
        this.setupContext(context);
      } else {
        // this context is not needed anymore
        this.contextInstanceCache.delete(context.id);
        console.log('deleted context')
      }
    }
    await this.persistContextInstanceCache();
  }

  async removeUnloadedContextsFromCache() {
    const originalCache = this.contextInstanceCache.values();
    let cacheChanged = false;
    for (const context of originalCache) {
      if (await this.isContextInjected(context) === false) {
        this.contextInstanceCache.delete(context.id);
        cacheChanged = true;
      }
    }
    if (cacheChanged) {
      await this.persistContextInstanceCache();
    }
  }

  /** Uses the lightweight interop module to invoke a javascript function. (Without creating an interpreter instance) */
  async invokeJsProcedure(contextIds: number[], qualifiedProcedureName: string, ...procedureArgs: any[]) {
    // NOT DRY!
    const contexts = contextIds.map(id => this.getContextInstanceFromCache(id));
    // inject interpreter where necessary
    await Promise.all(contexts.map(async context => this.injectFeatureIfNecessary(context, 'lightweight-js-interop')));

    const tabIds: Array<number> = contextIds.map((contextId: number) => this.getContextInstanceFromCache(contextId)!.tabId);
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

  /** Uses the lightweight interop module to get a javascript property. (Without creating an interpreter instance) */
  async getJsProperty(contextIds: number[], qualifiedPropertyName: string) {
    // STILL NOT DRY!
    const contexts = contextIds.map(id => this.getContextInstanceFromCache(id));
    // inject interpreter where necessary
    await Promise.all(contexts.map(async context => this.injectFeatureIfNecessary(context, 'lightweight-js-interop')));

    const tabIds: Array<number> = contextIds.map((contextId: number) => this.getContextInstanceFromCache(contextId)!.tabId);
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