// Enable chromereload by uncommenting this line:
import 'chromereload/devonly';
import { browser } from 'webextension-polyfill-ts';
import * as $ from 'jquery';

if (process.env.NODE_ENV === 'development') {
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
  browser.runtime.onMessage.addListener((m: {action: string, data: any}) => {
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