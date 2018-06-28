// Enable chromereload by uncommenting this line:
import 'chromereload/devonly';
import { browser, Browser, Runtime, Tabs } from 'webextension-polyfill-ts';
import { Golem } from './golem';
import { Schem } from './schem/schem';
import { SchemType, SchemString, SchemBoolean, SchemNil, SchemNumber } from './schem/types';
//import { bibApiKey } from './local/apiKeys';
import * as $ from 'jquery';
import { Settings } from './options';

// import almaKeywords from '!raw-loader!./schemScripts/almaKeywords.schem';
const almaKeywords = require('!raw-loader!./schemScripts/almaKeywords.schem');
const demoKeyBindings = require('!raw-loader!./schemScripts/demoKeyBindings.schem');

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


let portForAlmaTab: Runtime.Port;
const interpreterInstances: Map<number, Schem> = new Map<number, Schem>();

browser.runtime.onConnect.addListener((port: Runtime.Port) => {
  portForAlmaTab = port;
  if (typeof port.sender === 'undefined') throw `sender mustn't be undefined!`;
  if (typeof port.sender!.tab! === 'undefined') throw `tab mustn't be undefined!`;

  /** Always returns the same Schem instance for a specific tab. Creates one, if necessary.*/
  async function getInterpreterForTab(tab: Tabs.Tab): Promise<Schem> {
    if (!tab.id) throw `tab.id was undefined`;

    if (interpreterInstances.has(tab.id)) {
      // stuff that changes a tab's state has to be called again on reloads & navigation (only the schem environment survives them)
      // TODO: implement proper event handling, so the interpreter itself could react to this situation
      const interpreter = interpreterInstances.get(tab.id)!
      interpreter.arep(demoKeyBindings);
      return interpreter;
    } else {
      // Create and setup a new interpreter instance
      const interpreter = new Schem();
      interpreter.replEnv.addMap(coreGolemFunctions);

      await Settings.loadSettings().then(s => {
        interpreter.arep(s.configScript);
      });

      await interpreter.arep(almaKeywords);
      interpreterInstances.set(tab.id, interpreter);
      return interpreter;
    }
  }

  portForAlmaTab.onMessage.addListener((msg, port) => {
    if (msg.action === 'arep') {
      (async (schemExpression) => {
        const interpreter = await getInterpreterForTab(port.sender!.tab!);
        interpreter.arep(schemExpression).then(result => {
          console.log(result);
        });
      })(msg.schemExpression);
      return;
    }
    console.warn(`unknown action in message`, msg);
  });

  function postMessageToAlmaTab(msg: any) {
    (portForAlmaTab.postMessage as any)(msg);
  }

  const coreGolemFunctions: {[symbol: string]: SchemType} = {
    'set-val': (selector: SchemString, value: SchemString) => {
      postMessageToAlmaTab({
        action: 'set-val',
        data: {
          selector: selector.valueOf(),
          value: value.valueOf()
        }
      });
      return SchemBoolean.true;
    },
    'click': (selector: SchemString) => {
      postMessageToAlmaTab({
        action: 'click',
        data: {
          selector: selector.valueOf()
        }
      });
      return SchemBoolean.true;
    },
    'set-css': (selector: SchemString, property: SchemString, value: SchemString) => {
      postMessageToAlmaTab({
        action: 'set-css',
        data: {
          selector: selector.valueOf(),
          property: property.valueOf(),
          value: value.valueOf()
        }
      });
      return SchemBoolean.true;
    },
    'inject-css': (css: SchemString) => {
      injectCSS(port.sender!.tab!.id!, css.valueOf());
      return SchemBoolean.true;
    },
    'get-bib': async (mmsId: SchemString) => {
      //$.get(`https://api-na.hosted.exlibrisgroup.com/almaws/v1/bibs/${mmsId.valueOf()}?apikey=${bibApiKey}`).then(result => console.log(result));
      return SchemNil.instance;
    },
    'bind-key': (key: SchemString, schemExpression: SchemString) => {
      postMessageToAlmaTab({
        action: 'bind-key',
        data: {
          key: key.valueOf(),
          schemExpression: schemExpression.valueOf()
        }
      });
      return SchemBoolean.true;
    }
  };

  // initializes tab. TODO: restructure all of this
  getInterpreterForTab(port.sender!.tab!);

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