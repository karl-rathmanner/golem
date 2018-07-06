// Enable chromereload by uncommenting this line:
// import 'chromereload/devonly';
import * as $ from 'jquery';
import { browser } from 'webextension-polyfill-ts';

document.addEventListener('DOMContentLoaded', () => {
    console.log('options page loaded');

    Settings.loadSettings().then(settings => $('#configScript').val(settings.configScript));

    $('#save').click(() => {
      Settings.saveSettings({configScript: $('#configScript').val() as string});
    });
    $('#load').click(() => {
      Settings.loadSettings().then(settings => $('#configScript').val(settings.configScript));
    });
});

type GolemSettings = {
  configScript: string;
}

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