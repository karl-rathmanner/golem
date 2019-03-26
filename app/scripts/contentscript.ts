// Enable chromereload by uncommenting this line:
import { browser, Runtime } from 'webextension-polyfill-ts';
import * as $ from 'jquery';

if (process.env.NODE_ENV === 'development') {
  require('chromereload/devonly');
  // Exposing jQuery because chrome's dev tools use '$' as an alias for document.querySelector.
  // If you want to call jQuery from the dev tool's console: use jQuery() instead of $()
  (window as any).jQuery = $;
}

import { Golem } from './golem';


console.log(`Content script injected.`);
let golem: Golem;

(async () => {
  let probablyGolem = await Golem.getInstance();
  console.log('golem', probablyGolem);
  if (!probablyGolem) throw `couldn't get a golem instance`;
  golem = probablyGolem;
  startListening();
})();

function startListening() {
  golem.addEventListeners();
  browser.runtime.onMessage.addListener(async (m: {action: string, data: any}, sender: Runtime.MessageSender) => {
    switch (m.action) {
      case 'showGolemInput':
        golem.toggleInputBoxVisibility();

      // (port.postMessage as any)({action: 'toggleInputBoxVisibility'});
        return true;
      default:
        console.warn(`content script received unknown message`, m);
      }
      return false;
  });
}