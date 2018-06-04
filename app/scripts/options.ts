// Enable chromereload by uncommenting this line:
// import 'chromereload/devonly';
import { browser } from 'webextension-polyfill-ts';

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('button')!.addEventListener('click', sayHello);
    console.log('options page loaded');
});

function sayHello() {
    browser.runtime.sendMessage('Hello from the other side').then((r) => {
        console.log(r);
    });
}

class Settings {
  public static async getSettings(): Promise<any> {
    const values = await browser.storage.local.get({settings: {}}).then(results => {
      let settings = results.settings;
      /*if (!(settings instanceof Array)) {
        console.warn('command History empty or corrupted');
      }*/
      return true;
    });
    return values;
  }
}