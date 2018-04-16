// Enable chromereload by uncommenting this line:
import 'chromereload/devonly';
import { browser, Browser, Runtime, Tabs } from 'webextension-polyfill-ts';
import { Golem } from './golem';
import { Schem } from './schem/schem';
import { SchemType, SchemString, SchemBoolean } from './schem/types';

// import almaKeywords from '!raw-loader!./schemScripts/almaKeywords.schem';
const almaKeywords = require('!raw-loader!./schemScripts/almaKeywords.schem');
// const almaKeywords: string = almaKeywordsContent;

chrome.runtime.onInstalled.addListener((details) => {
  console.log('previousVersion', details.previousVersion);
});



browser.runtime.onMessage.addListener((message: {action: string, data: any}, sender) => {
  switch (message.action) {
    case 'getInterpreter':
    case 'notify': {
      notify(message.data.message);
      return true;
    }

    default: {
      console.warn(`unknown message received`);
      console.warn(message);
      return 'idk';
    }
  }
});

function notify(message: string) {
  browser.notifications.create('noty', {
    'type': 'basic',
    'iconUrl': browser.extension.getURL('images/icon-48.png'),
    'title': 'Golem says:',
    'message': message
  });
}

function injectCSS(tabId: number, css: string) {
  browser.tabs.insertCSS(tabId, {code: css});
}

browser.tabs.onUpdated.addListener((id, changeInfo, tab) => {
});


let portForTab: Runtime.Port;
const interpreterInstances: Map<number, Schem> = new Map<number, Schem>();

browser.runtime.onConnect.addListener((port: Runtime.Port) => {
  portForTab = port;
  if (typeof port.sender === 'undefined') throw `sender mustn't be undefined!`;
  if (typeof port.sender!.tab! === 'undefined') throw `tab mustn't be undefined!`;

  /** Always returns the same Schem instance for a specific tab. Creates one, if necessary.*/
  function getInterpreterForTab(tab: Tabs.Tab): Schem {
    if (!tab.id) throw `tab.id was undefined`;

    if (interpreterInstances.has(tab.id)) {
      return interpreterInstances.get(tab.id)!;
    } else {
      const interpreter = new Schem();
      interpreter.replEnv.addMap(coreGolemFunctions);
      interpreter.arep(almaKeywords);
      interpreterInstances.set(tab.id, interpreter);
      return interpreter;
    }
  }

  portForTab.onMessage.addListener((msg, port) => {
    console.log(msg);
    if (msg.action === 'arep') {
      return getInterpreterForTab(port.sender!.tab!).arep(msg.schemExpression);
    }
    console.warn(`unknown action`);
    return false;
  });

  function postMessageToHostTab(msg: any) {
    (portForTab.postMessage as any)(msg);
  }

  const coreGolemFunctions: {[symbol: string]: SchemType} = {
    'setVal': (selector: SchemString, value: SchemString) => {
      postMessageToHostTab({
        action: 'setVal',
        data: {
          selector: selector.valueOf(),
          value: value.valueOf()
        }
      });
      return SchemBoolean.true;
    },
    'click': (selector: SchemString) => {
      postMessageToHostTab({
        action: 'click',
        data: {
          selector: selector.valueOf()
        }
      });
      return SchemBoolean.true;
    },
    'injectCSS': (css: SchemString) => {
      injectCSS(port.sender!.tab!.id!, css.valueOf());
      return SchemBoolean.true;
    }
  };
});

browser.commands.onCommand.addListener(function(command) {
  switch (command) {
    case 'go-go-golem': {

      browser.tabs.query({currentWindow: true}).then((tabs) => {
        browser.windows.getCurrent().then((window) => {
          if (window.id) browser.windows.update(window.id, {state: 'maximized', focused: true});
        });

        for (let tab of tabs) {
          if (tab && tab.id && /alma/.test(tab.url!) && !/pdsHandleLogin/.test(tab.url!)) {
            browser.tabs.sendMessage(tab.id, {action: 'showGolemInput'});

            /* random example
            browser.tabs.sendMessage(tab.id, {msg: 'mo color?', color: '#' + Math.floor(Math.random() * 16777215).toString(16) })
            .then((v) => console.log(v))
            .catch((e) => {
              console.log(e);
            }); */
          }
        }
      });
      break;
    }
    case 'open-schem-playground':
      browser.tabs.create({url: './pages/schemTest.html'});
      break;

    case 'advanceSchemInterpreter':
      browser.runtime.sendMessage({action: 'advanceSchemInterpreter'});
  }
});
