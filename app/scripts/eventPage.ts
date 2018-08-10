import 'chromereload/devonly';
import { browser, Tabs } from 'webextension-polyfill-ts';
import { SchemContextDefinition, SchemContextInstance } from './schem/types';
import { EventPageMessage } from './eventPageMessaging';
import { SchemContextManager } from './contextManager';

chrome.runtime.onInstalled.addListener((details) => {
  console.log('previousVersion', details.previousVersion);
});

let lastContextID = 0;




window.golem = {
  contextId: 0,
  priviledgedContext: {
    contextManager: new SchemContextManager()
  }
};

browser.runtime.onMessage.addListener(async (message: EventPageMessage, sender): Promise<any> => {

  switch (message.action) {
    case 'create-contexts': {
      // data may contain a queryInfo object and a frameId value
      const queryInfo: Tabs.QueryQueryInfoType = message.args.queryInfo;
      const frameId = (typeof message.args.frameId === 'number') ? message.args.frameId : 0;

      let tabs;

      try {
        tabs = await browser.tabs.query(queryInfo);
      } catch (e) {
        // *resolve* with a plain object - the actual value of 'e' can't be jsonified, I guess. (at least it won't work for *some* reason...)
        return Promise.resolve({error: {message: e.message}});
      }

      const contextDetails = await tabs.map(async (tab): Promise<SchemContextDefinition> => {
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
          await browser.tabs.executeScript(tab.id, {file: 'scripts/demoContentScript.js', frameId: frameId}).catch(e => e);
          return {
            contextId: newContextID,
            windowId: typeof tab.windowId !== 'undefined' ? tab.windowId : -1,
            tabId: typeof tab.id !== 'undefined' ? tab.id : -1,
            frameId: frameId,
            lifetime: 'inject-once'
          };
        }
        return Promise.reject(`Provided a context with an illegal tabId: ${tab.id}`);
      });

      return Promise.all(contextDetails);
    }

    case 'inject-interpreter': {
      if (message.contexts != null) {
        return Promise.all(message.contexts.map(async context => {
          await browser.tabs.executeScript(context.tabId, {file: 'scripts/localInterpreterCS.js', frameId: context.frameId}).catch(e => e);
        }));
      } else {
        return Promise.reject('no context supplied to inject-interpreter');
      }
    }

    case 'arep-in-contexts': {
      if (message.contexts != null && message.args.code != null) {
        const tabIds: Array<number> = message.contexts.map((context: SchemContextDefinition) => context.tabId);
        const resultsAndReasons = await Promise.all(
          tabIds.map(async tabId => {
            return browser.tabs.sendMessage(tabId, {
              action: 'invoke-context-procedure',
              args: {
                procedureName: 'arep',
                procedureArgs: [message.args.code, message.args.options]
              }
            }).catch(e => e);
          }
        ));
        console.log(resultsAndReasons);
        return resultsAndReasons;

      }
    }

    case 'forward-context-action': {
      if (message.contexts != null && message.contextMessage != null) {
        // forward the message to the appropriate contexts
        const tabIds: Array<number> = message.contexts.map((context: SchemContextDefinition) => context.tabId);
        const resultsAndReasons = await Promise.all(
          tabIds.map(async tabId => {
            return browser.tabs.sendMessage(tabId, {
              action: message.contextMessage!.action,
              args: message.contextMessage!.args
            }).catch(e => e);
          }
        ));
        console.log(resultsAndReasons);
        return resultsAndReasons;
      }
    }

    case 'notify': {
      notify(message.args.message);
      return true;
    }

    default: {
      console.warn(`unknown message received`);
      console.warn(message);
      return `event page can't handle the action`;
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
      browser.windows.getCurrent().then(currentWindow => {
        const halfHorizontalResolution = window.screen.width / 2;
        const currentWindowWidth = currentWindow.width ? currentWindow.width : 100;
        let editorWindowWidth = currentWindow.width;
        let editorWindowLeft = currentWindow.left;

        // put current window and editor window in a split layout, if the current window is smaller than about half the screen resolution
        if (currentWindowWidth < halfHorizontalResolution + 20) {
          currentWindow.width = editorWindowWidth = halfHorizontalResolution;
          currentWindow.left = 0;
          editorWindowLeft = halfHorizontalResolution;
        }
        browser.windows.create({
          url: './pages/editor.html',
          top: currentWindow.top, left: editorWindowLeft,
          height: currentWindow.height, width: editorWindowWidth
        });
      });
      break;

    case 'advanceSchemInterpreter':
      browser.runtime.sendMessage({action: 'advanceSchemInterpreter'});
  }
});

