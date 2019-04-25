import { browser } from 'webextension-polyfill-ts';

export type GolemSettings = {
  runCommands: string;
};

export class Settings {
  public static async loadSettings(): Promise<GolemSettings> {
    return await browser.storage.local.get({settings: {}}).then(results => {
      const settings = results.settings as GolemSettings;
      if (!(settings)) {
        console.warn('settings empty or corrupted');
      }
      return settings;
    });
  }

  public static async saveSettings(settings: GolemSettings) {
    browser.storage.local.get(settings).then(results => {
      if (!results) {
        console.warn('settings empty or corrupted');
      }
      results.settings = settings;
      browser.storage.local.set(results);
    });
  }
}