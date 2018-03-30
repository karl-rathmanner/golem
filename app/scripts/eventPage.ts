// Enable chromereload by uncommenting this line:
import 'chromereload/devonly';
import { browser, Browser } from 'webextension-polyfill-ts';

chrome.runtime.onInstalled.addListener((details) => {
  console.log('previousVersion', details.previousVersion);
});

browser.runtime.onMessage.addListener((m: {action: string, message: string}) => {
  switch (m.action) {
    case 'notify': {
      notify(m.message);
      return true;
    }

    default: {
      console.warn(`unknown message received`);
      console.warn(m);
      return 'idk';
    }
  }
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


browser.commands.onCommand.addListener(function(command) {
  switch (command) {
    case 'go-go-golem': {
      console.log('Doing stuff!');
      browser.tabs.query({currentWindow: true}).then((tabs) => {
        let tab;
        for (tab of tabs) {
          if (tab && tab.id && /alma/.test(tab.url!)) {
            browser.windows.getCurrent().then((window) => {
              if (window.id) browser.windows.update(window.id, {state: 'maximized', focused: true});
            });
            browser.tabs.sendMessage(tab.id, {msg: 'mo color?', color: '#' + Math.floor(Math.random() * 16777215).toString(16) })
            .then((v) => console.log(v))
            .catch((e) => {
              console.log(e);
            });
          }
        }
      });
      break;
    }
    case 'open-schem-playground': {
      browser.tabs.create({url: './pages/schemTest.html'});
    }
  }

});