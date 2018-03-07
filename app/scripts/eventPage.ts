// Enable chromereload by uncommenting this line:
import 'chromereload/devonly';
import { browser } from 'webextension-polyfill-ts';

chrome.runtime.onInstalled.addListener((details) => {
  console.log('previousVersion', details.previousVersion);
});

browser.runtime.onMessage.addListener((m) => {
  console.log(m);



  return 'coo.';
});


function notify(message: string) {
  browser.notifications.create('noty', {
    'type': 'basic',
    'iconUrl': browser.extension.getURL('images/icon-48.png'),
    'title': 'wheee!',
    'message': message
  });
}

function injectCSS(tab: any) {
  // notify('he meeps:' + tab.id);
  console.log('he meeps:' + tab.id);
  // browser.tabs.removeCSS(tab.id);
  browser.tabs.insertCSS(tab.id, {code: `
  @media print {
    :not(.printable) {
      display: none !important;
    }
    div.printable {
      display: block !important;
      background-color: hotpink !important;
    }
  }
  `});
}

browser.tabs.onUpdated.addListener((id, changeInfo, tab) => {
  injectCSS(tab);
});
