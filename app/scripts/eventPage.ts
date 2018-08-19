import 'chromereload/devonly';
import { browser, Tabs } from 'webextension-polyfill-ts';
import { SchemContextDefinition, SchemContextInstance } from './schem/types';
import { EventPageMessage } from './eventPageMessaging';
import { SchemContextManager } from './contextManager';
import { Golem } from './golem';

chrome.runtime.onInstalled.addListener((details) => {
  console.log('previousVersion', details.previousVersion);
});

window.golem = {
  contextId: 0,
  features: [],
  priviledgedContext: {
    contextManager: new SchemContextManager()
  }
};

const contextManager = window.golem.priviledgedContext!.contextManager;

browser.runtime.onMessage.addListener(async (message: EventPageMessage, sender): Promise<any> => {

  switch (message.action) {
    case 'forward-context-action': {
      if (message.contextIds != null && message.contextMessage != null) {
        // forward the message to the appropriate contexts
        const tabIds = message.contextIds.map((contextId) => contextManager.getContextInstance(contextId)!.tabId);
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
      openEditor();
      break;

    case 'advanceSchemInterpreter':
      browser.runtime.sendMessage({action: 'advanceSchemInterpreter'});
  }
});


export function openEditor(fileName?: string) {
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
      url: './pages/editor.html' + (fileName ? `#${fileName}` : ''),
      top: currentWindow.top, left: editorWindowLeft,
      height: currentWindow.height, width: editorWindowWidth
    });
  });
}