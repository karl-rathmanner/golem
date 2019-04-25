import { SchemContextManager } from "./contextManager";
import { Schem } from "./schem/schem";
import { SchemContextDefinition } from "./schem/types";
import { GolemSettings, Settings } from "./Settings";
import { CommandHistory } from "./utils/commandHistory";

/** Holds global state and initializes core functionality. (Parts of that state are persistent in varying degrees.) */
export class GlobalGolemState {
  private static instance: GlobalGolemState;

  //private globalGolemFunctions: GlobalGolemFunctions;
  public contextManager: SchemContextManager;
  
  // TODO: Move anything that has to be persistent to storage!
  public autoinstantiateContexts = new Array<SchemContextDefinition>();
  public eventPageInterpreter: Schem;
  public isReady = false;
  public settings: GolemSettings;
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
    this.settings = await Settings.loadSettings();
  
    this.isReady = true;
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
