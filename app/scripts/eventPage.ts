import 'chromereload/devonly';
import { browser, Omnibox } from 'webextension-polyfill-ts';
import { SchemContextManager } from './contextManager';
import { EventPageMessage } from './eventPageMessaging';
import { Schem } from './schem/schem';
import { isSchemList, isSchemSymbol } from './schem/typeGuards';
import { CommandHistory } from './utils/commandHistory';
import { extractErrorMessage, addParensAsNecessary, escapeXml } from './utils/utilities';

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
const omniboxInterpreter = new Schem();
const omniboxHistory = new CommandHistory();

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

function notify(message: string, title?: string) {
  browser.notifications.create('noty', {
    'type': 'basic',
    'iconUrl': browser.extension.getURL('images/icon-48.png'),
    'title': title ? title : 'Golem says:',
    'message': message
  });
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    contextManager.restoreContextsAfterReload(tabId);
  }
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

browser.omnibox.onInputChanged.addListener((text: string, suggest) => {
  
  const defaultSuggestion = addParensAsNecessary(text);
  browser.omnibox.setDefaultSuggestion({description: '> ' + escapeXml(defaultSuggestion)});

  // we don't know the cursor position, so autocomplete will just always consider the rightmost token
  const matches = /(.*?)([a-zA-Z_#][a-zA-Z0-9_\-\?\!\*]*)$/.exec(text); // token regex (the second capturing group) taken from schemLanguage.ts
  const everythingBeforeTheLastToken = matches != null ? matches[1] : null;
  const lastToken = matches != null ? matches[2] : null;
 
  // get a list of bound symbols and turn them into SuggestionResults
  omniboxInterpreter.readEval(`(sort-and-filter-by-string-similarity "${lastToken}" (list-symbols))`).then(async (result) => {
    let suggestions: Omnibox.SuggestResult[] = [];

    // add at most three autocomplete suggestions (to leave some space for command history items)
    if (isSchemList(result)) {
      suggestions = result.slice(0,3).map((symbol) => {
        if (isSchemSymbol(symbol)) {
          const encodedCode = escapeXml(everythingBeforeTheLastToken + symbol.name);
          return {
            content: encodedCode, 
            description: '[ac]: ' + addParensAsNecessary(encodedCode)
          }; 
        } else {
          return {content: 'errors', description: 'this should never happen!'}
        }
      });        
    }

    // add at most five command history suggestions
    const lastCommands = (await omniboxHistory.lastNCommands(5)).reverse();
    suggestions.push(...lastCommands.map( command => {
      const encodedCode = escapeXml(command);
      return {
        content: encodedCode,
        description: '[ch]: ' + addParensAsNecessary(encodedCode)
      };
    }));

    suggest(suggestions);
  });
});

browser.omnibox.onInputEntered.addListener((text: string) => {
  // evaluate omnibox expression and display results in a notification
  text = addParensAsNecessary(text);
  omniboxHistory.addCommandToHistory(text);

  omniboxInterpreter.arep(text).then(
    result => notify(result, 'Result:')
  ).catch(
    e => notify(extractErrorMessage(e), 'Error:')
  );
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