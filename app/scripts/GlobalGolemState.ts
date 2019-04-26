import { SchemContextManager } from "./contextManager";
import { Schem } from "./schem/schem";
import { SchemContextDefinition, SchemContextInstance } from "./schem/types";
import { Settings } from "./Settings";
import { CommandHistory } from "./utils/commandHistory";
import { browser } from "webextension-polyfill-ts";

/** Holds global state and initializes core functionality. (Parts of that state are persistent in varying degrees.) */
export class GlobalGolemState {
  private static instance: GlobalGolemState;

  //private globalGolemFunctions: GlobalGolemFunctions;
  public contextManager: SchemContextManager;
  
  public activeContextInstances = new Array<SchemContextInstance>();
  public autoinstantiateContexts = new Array<SchemContextDefinition>();
  public eventPageInterpreter: Schem;
  public isReady = false;
  public omniboxHistory = new CommandHistory();
  
  private constructor() {
  }

  public static async getInstance() {
    if (this.instance == null) {
      this.instance = new GlobalGolemState();
      await this.instance.init()
    }
    return this.instance;
  }

  private async init() {
    this.eventPageInterpreter = new Schem();
    await this.eventPageInterpreter.loadCore();
    this.contextManager = new SchemContextManager();
    console.log(`Global state object created and initialized.`);
  }

  public async getSettings() {
    // TODO: think about replacing Settings with some general mechanism to store persistent state here.
    return Settings.loadSettings();
  }

  public static async loadObject<T>(key: string): Promise<T|null> {
    return await browser.storage.local.get('persistedState').then(results => {
      if (results.persistedState == null) {
        console.warn(`No persistedState object found in local storage.`)
        return null;
      }
      const obj = results.persistedState[key] as T;
      if (!(obj)) {
        console.warn(`Object '${key}' could not be found in local storage.`);
        return null;
      }
      return obj;
    });
  }

  public static async saveObject<T>(key: string, obj: T) {
    browser.storage.local.get('persistedState').then(results => {
      if (results.persistedState == null) {
        console.log('Creating new persistedState object');
        results = { persistedState: {} };
      }
      results.persistedState[key] = obj;
      browser.storage.local.set(results);
    });
  }

  public async getAutoinstantiateContexts() {
    return this.autoinstantiateContexts;
  }

  public async setAutoinstantiateContexts(newAICs: SchemContextDefinition[]) {
    this.autoinstantiateContexts = newAICs;
  }

  public async addAutoinstantiateContext(newAIC: SchemContextDefinition) {
    this.autoinstantiateContexts.push(newAIC);
  }

  public async clearAutoinstantiateContexts() {
    this.autoinstantiateContexts = new Array<SchemContextDefinition>();
  }
}
