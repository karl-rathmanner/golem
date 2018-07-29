import 'chromereload/devonly';
import { browser, Tabs } from 'webextension-polyfill-ts';
import { SchemContextDetails } from './schem/types';
const baseContentScript = require('!raw-loader!./baseContentScript');
chrome.runtime.onInstalled.addListener((details) => {
  console.log('previousVersion', details.previousVersion);
});

let lastContextID = 0;

browser.runtime.onMessage.addListener(async (message: {action: string, data: any}, sender): Promise<any> => {
  switch (message.action) {
    case 'notify': {
      notify(message.data.message);
      return true;
    }
    case 'create-contexts': {
      // data may contain a queryInfo object and a frameId value
      const queryInfo: Tabs.QueryQueryInfoType = message.data.queryInfo;
      const frameId = (typeof message.data.frameId === 'number') ? message.data.frameId : 0;

      let tabs;

      try {
        tabs = await browser.tabs.query(queryInfo);
      } catch (e) {
        // *resolve* with a plain object - the actual value of 'e' can't be jsonified, I guess. (at least it won't work for *some* reason...)
        return Promise.resolve({error: {message: e.message}});
      }

      const contextDetails = await tabs.map(async (tab): Promise<SchemContextDetails> => {
        if (typeof tab.id !== 'undefined') {

          const newContextID = lastContextID++;
          if (!Number.isInteger(newContextID)) {
            throw new Error(`I don't think this could ever happen, but I'm paranoid about script injection and this check won't hurt anyone.`);
          }

          // add and initialize global golem object that content scripts can share
          await browser.tabs.executeScript(tab.id, {
            code: `
              var golem = {contextId: ${newContextID}};
              golem.injectedProcedures = new Map();
              `,
            frameId: frameId
          }).catch(e => {
            return new Error(`Failed to inject content script!`);
          });
          // inject actual content script
          // TODO: modularize content scripts and inject specific parts only when needed
          await browser.tabs.executeScript(tab.id, {file: 'scripts/baseContentScript.js', frameId: frameId}).catch(e => e); // turn error into resolved promise
          await browser.tabs.executeScript(tab.id, {file: 'scripts/demoContentScript.js', frameId: frameId}).catch(e => e); // turn error into resolved promise
          return {
            contextId: newContextID,
            windowId: typeof tab.windowId !== 'undefined' ? tab.windowId : -1,
            tabId: typeof tab.id !== 'undefined' ? tab.id : -1,
            frameId: frameId
          };
        }
        return Promise.reject(`Provided a context with an illegal tabId: ${tab.id}`);
      });

      return Promise.all(contextDetails);
    }

    case 'invoke-context-procedure': {
      const tabIds: Array<number> = message.data.contexts.map((context: SchemContextDetails) => context.tabId);
      const resultsAndReasons = await Promise.all(
        tabIds.map(async tabId => {
          return browser.tabs.sendMessage(tabId, {
            action: 'invoke-context-procedure',
            data: {
              procedureName: message.data.procedureName,
              args: message.data.args
            }
          }).catch(e => e);
        }
      ));
      console.log(resultsAndReasons);
      return resultsAndReasons;
    }

    case 'invoke-js-procedure-in-contexts': {
      const tabIds: Array<number> = message.data.contexts.map((context: SchemContextDetails) => context.tabId);
      const resultsAndReasons = await Promise.all(
        tabIds.map(async tabId => {
          return browser.tabs.sendMessage(tabId, {
            action: 'invoke-javascript-procedure',
            data: {
              qualifiedProcedureName: message.data.qualifiedProcedureName,
              args: message.data.args
            }
          }).catch(e => e);
        }
      ));
      console.log(resultsAndReasons);
      return resultsAndReasons;
    }

    case 'set-js-property-in-contexts': {
      const tabIds: Array<number> = message.data.contexts.map((context: SchemContextDetails) => context.tabId);
      const resultsAndReasons = await Promise.all(
        tabIds.map(async tabId => {
          return browser.tabs.sendMessage(tabId, {
            action: 'set-javascript-property',
            data: {
              qualifiedPropertyName: message.data.qualifiedPropertyName,
              value: message.data.value
            }
          }).catch(e => e);
        }
      ));
      console.log(resultsAndReasons);
      return resultsAndReasons;
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

browser.commands.onCommand.addListener(function(command) {
  switch (command) {
    case 'go-go-golem': {
      browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
        browser.windows.getCurrent().then((window) => {
          if (window.id) browser.windows.update(window.id, {state: 'maximized', focused: true});
        });

        for (let tab of tabs) {
          if (tab && tab.id && !/pdsHandleLogin/.test(tab.url!)) {
            browser.tabs.sendMessage(tab.id, {action: 'showGolemInput'});
          }
        }
      });
      break;
    }
    case 'open-schem-playground':
      browser.tabs.create({url: './pages/schemTest.html'});
      break;

    case 'open-editor':
      browser.windows.create({url: './pages/editor.html'});
      break;

    case 'advanceSchemInterpreter':
      browser.runtime.sendMessage({action: 'advanceSchemInterpreter'});
  }
});