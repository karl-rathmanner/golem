import 'chromereload/devonly';
import { browser, Omnibox } from 'webextension-polyfill-ts';
import { SchemContextManager } from './contextManager';
import { EventPageMessage } from './eventPageMessaging';
import { Schem } from './schem/schem';
import { isSchemList, isSchemSymbol } from './schem/typeGuards';
import { CommandHistory } from './utils/commandHistory';
import { addParensAsNecessary, escapeXml } from './utils/utilities';
import { schemToJs } from './javascriptInterop';
import { Settings } from './settings';



window.golem = {
  contextId: 0,
  features: [],
  priviledgedContext: {
    contextManager: new SchemContextManager()
  }
};

const contextManager = window.golem.priviledgedContext!.contextManager;
const eventPageInterpreter = new Schem();

const omniboxEnvOverride = {
  'notify': (msg: any) => notify(schemToJs(msg))
};
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

    case 'execute-run-commands': {
      executeRunCommands();
      break;
    }

    case 'reload-golem': {
      chrome.runtime.reload();
      break;
    }

    default: {
      console.warn(`unknown message received`);
      console.warn(message);
      return `event page can't handle the action`;
    }
  }
});

browser.runtime.onStartup.addListener(executeRunCommands);
chrome.runtime.onInstalled.addListener((details) => {
  console.log('previousVersion', details.previousVersion);
  executeRunCommands();
});

export async function executeRunCommands() {
  let settings = await Settings.loadSettings();
  
  if (settings.runCommands.length > 0) {
    console.log("Executing run commands.")
    await eventPageInterpreter.arep(`(do ${settings.runCommands})`);
    console.log("Run commands executed.")
  } else {
    console.log("No run commands found.")
  }
}

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
      openEditor(false);
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
  // also: add a 'notify' symbol because that function will be made available through omniboxEnvOverride
  eventPageInterpreter.readEval(`(sort-and-filter-by-string-similarity "${lastToken}" (cons 'notify (list-symbols)))`).then(async (result) => {
    let suggestions: Omnibox.SuggestResult[] = [];

    // add at most three autocomplete suggestions (to leave some space for command history items)
    if (isSchemList(result)) {
      suggestions = result.slice(0, 3).map((symbol) => {
        if (isSchemSymbol(symbol)) {
          const encodedCode = escapeXml(everythingBeforeTheLastToken + symbol.name);
          return {
            content: encodedCode,
            description: '[ac]: ' + addParensAsNecessary(encodedCode)
          };
        } else {
          return {content: 'errors', description: 'this should never happen!'};
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
  eventPageInterpreter.arep(text, omniboxEnvOverride).then(result => {
    console.log('Omnibox evalutation result:', result);
  }).catch(e => {
    console.error('Omnibox evaluation error:', e);
  });
});

export function openEditor(inNewWindow: boolean = true, fileName?: string) {
  browser.windows.getCurrent().then(currentWindow => {
    if (inNewWindow) {
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
    } else {
      browser.tabs.create({url: './pages/editor.html' + (fileName ? `#${fileName}` : '')});
    }
  });
}