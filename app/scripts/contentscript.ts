// Enable chromereload by uncommenting this line:
import 'chromereload/devonly';
import { browser } from 'webextension-polyfill-ts';
import * as $ from 'jquery';


declare var process: {
  env: {
    NODE_ENV: string
  }
};


if (process.env.NODE_ENV === 'development') {
  //
  // Exposing jQuery because chrome's dev tools use '$' as an alias for document.querySelector.
  // If you want to call jQuery from the dev tool's console: use jQuery() instead of $()
  (window as any).jQuery = $;
}
import { Golem } from './golem';

console.log(`Hello from the content script`);

// let printme: Element;
let printme = document.createElement('div');


printme.appendChild(document.createTextNode('Behold! I am to be printed! I hope.'));
printme.setAttribute('class', 'printable');
document.body.appendChild(printme);

const golem = new Golem();

browser.runtime.onMessage.addListener((m: {action: string, data: any}) => {
  switch (m.action) {
    case 'showGolemInput':
      golem.toggleInputBoxVisibility();
      break;
    case 'moColor':
      $('.widgetContainer').css('background-color', m.data.color);
      break;
    default:
      console.warn(`content script received unknown message`);
      console.warn(m);
  }
});