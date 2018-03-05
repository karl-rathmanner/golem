// Enable chromereload by uncommenting this line:
import 'chromereload/devonly';
import { browser } from 'webextension-polyfill-ts';

chrome.runtime.onInstalled.addListener((details) => {
  console.log('previousVersion', details.previousVersion);
});

browser.runtime.onMessage.addListener((m) => {
  console.log(m);

  browser.notifications.create('noty', {
    'type': 'basic',
    'iconUrl': browser.extension.getURL('images/icon-48.png'),
    'title': 'wheee!',
    'message': 'you have been notified'
  });

  return 'coo.';
});
