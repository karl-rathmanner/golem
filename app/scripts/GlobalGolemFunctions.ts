import { browser, Omnibox, Runtime, Tabs } from 'webextension-polyfill-ts';
import { EventPageMessage } from './eventPageMessaging';
import { GlobalGolemState } from './GlobalGolemState';
import { schemToJs } from './javascriptInterop';
import { isSchemList, isSchemSymbol } from './schem/typeGuards';
import { SchemBoolean, SchemContextDefinition, SchemList, SchemContextInstance } from './schem/types';
import { addParensAsNecessary, escapeXml, objectPatternMatch } from './utils/utilities';
import { GolemContextMessage } from './contentScriptMessaging';

/** Responsible for subscribing to global browser events. Also exposes a mixed bag of functions that should be available in privileged contexts. */
export class GlobalGolemFunctions {

    constructor(private globalState: GlobalGolemState) {
    }

    public addEventPageListeners = () => {
        browser.runtime.onMessage.addListener(this.onMessageHandler);
        browser.omnibox.onInputChanged.addListener(this.omniboxInputChangedHandler);
        browser.omnibox.onInputEntered.addListener(this.omniboxInputEnteredHandler);
        browser.commands.onCommand.addListener(this.onCommandHandler);
    }

    private onMessageHandler = async (message: EventPageMessage, sender: Runtime.MessageSender): Promise<any> => {
        switch (message.action) {
            case 'forward-context-action': {
                if (message.contextIds != null && message.contextMessage != null) {
                    // forward the message to the appropriate contexts
                    const tabIds = await Promise.all(message.contextIds.map(async (contextId) => {
                        const contextInstance = await this.globalState.contextManager.getContextInstance(contextId);
                        return contextInstance.tabId;
                    }));
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
                this.notify(message.args.message);
                return true;
            }

            case 'execute-run-commands': {
                this.executeRunCommands();
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
    }

    private onCommandHandler = async (command: string) => {
        switch (command) {
            case 'go-go-golem': {
                browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
                    browser.windows.getCurrent().then((window) => {
                        if (window.id) browser.windows.update(window.id, { state: 'maximized', focused: true });
                    });

                    for (let tab of tabs) {
                        if (tab && tab.id) {
                            browser.tabs.sendMessage(tab.id, { action: 'showGolemInput' });
                        }
                    }
                });
                break;
            }
            case 'open-schem-playground':
                browser.tabs.create({ url: './pages/schemTest.html' });
                break;

            case 'open-editor':
                window.golem.priviledgedContext!.globalFunctions.openEditor(false);
                break;

            case 'advanceSchemInterpreter':
                browser.runtime.sendMessage({ action: 'advanceSchemInterpreter' });
        }

        if (command.startsWith('bindableCommand')) {
            // These have a numbered suffix between 1 and 5. e.g. "bindableCommand1"
            const commandNr = command[command.length - 1];
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });

            const activeTabId = (tabs == null) ? null : tabs[0].id;
            if (activeTabId != null) {
                const backgroundPage = browser.extension.getBackgroundPage();
                const ggsInstance = (backgroundPage.golem.priviledgedContext == null) ? null : backgroundPage.golem.priviledgedContext.globalState;

                if (ggsInstance != null) {
                    const cidInTab = await GlobalGolemFunctions.getContextInstanceInTab(activeTabId);
                    const ggs = await GlobalGolemState.getInstance();
                    if (cidInTab != null && ggs != null) {
                        ggs.contextManager.arepInContexts([cidInTab.id], `(if (not= nil (resolve 'on-command-${commandNr})) (on-command-${commandNr}))`);
                    }
                }
            }

        }
    }

    public eventPageInterpreterSchemFunctions = {
        'add-autoinstantiate-context': async (context: SchemContextDefinition) => {
            const contextDefinition = context;
            const currentAICs = await this.globalState.getAutoinstantiateContexts();

            // Try to prevent a context definition from being added multiple times
            // TODO: replace objectPatternMatch with better equality check
            if (currentAICs.find((element) => objectPatternMatch(element, contextDefinition)) === undefined) {
                this.globalState.addAutoinstantiateContext(contextDefinition);
                return SchemBoolean.true;
            } else {
                return SchemBoolean.false;
            }
        },
        'clear-autoinstantiate-context': async () => {
            // const bgp = await browser.runtime.getBackgroundPage();
            this.globalState.clearAutoinstantiateContexts();
            return SchemBoolean.true;
        },
        'list-autoinstantiate-context-definitions': async () => {
            const aic = await this.globalState.getAutoinstantiateContexts();
            return new SchemList(...aic);
        },
        'notify': (msg: string) => {
            this.notify(msg.valueOf());
        }
    };

    private notify(message: string, title?: string) {
        browser.notifications.create('noty', {
            'type': 'basic',
            'iconUrl': browser.extension.getURL('images/icon-48.png'),
            'title': title ? title : 'Golem says:',
            'message': message
        });
    }

    public async executeRunCommands() {
        let settings = await this.globalState.getSettings();

        if (settings == null) {
            console.warn(`Wanted to execute run commands but globalState wasn't ready.`);
        } else if (settings.runCommands != null && settings.runCommands.length > 0) {
            console.log('Executing run commands.');
            await this.globalState.eventPageInterpreter.arep(`(do ${settings.runCommands})`);
        } else {
            console.log('No run commands found.');
        }
    }

    public static getContextInstanceInTab(tabId: number) {
        const msg: GolemContextMessage = { action: 'get-context-instance' };
        return browser.tabs.sendMessage(tabId, msg).then(result => {
            if (result == null) return null;
            return SchemContextInstance.fromStringified(result);
        }).catch(r => {
            // Sending the message will fail if there is no active content script in the adressed tab.
            return null;
        });
    }


    /// Omnibox support

    private omniboxEnvOverride = {
        'notify': (msg: any) => this.notify(schemToJs(msg))
    };

    private omniboxInputChangedHandler = (text: string, suggest: (suggestResults: Omnibox.SuggestResult[]) => void) => {

        const defaultSuggestion = addParensAsNecessary(text);
        browser.omnibox.setDefaultSuggestion({ description: '> ' + escapeXml(defaultSuggestion) });

        // we don't know the cursor position, so autocomplete will just always consider the rightmost token
        const matches = /(.*?)([a-zA-Z_#][a-zA-Z0-9_\-\?\!\*]*)$/.exec(text); // token regex (the second capturing group) taken from schemLanguage.ts
        const everythingBeforeTheLastToken = matches != null ? matches[1] : null;
        const lastToken = matches != null ? matches[2] : null;

        // get a list of bound symbols and turn them into SuggestionResults
        // also: add a 'notify' symbol because that function will be made available through omniboxEnvOverride
        this.globalState.eventPageInterpreter.readEval(`(sort-and-filter-by-string-similarity "${lastToken}" (cons 'notify (list-symbols)))`).then(async (result) => {
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
                        return { content: 'errors', description: 'this should never happen!' };
                    }
                });
            }

            // add at most five command history suggestions
            const lastCommands = (await this.globalState.omniboxHistory.lastNCommands(5)).reverse();
            suggestions.push(...lastCommands.map(command => {
                const encodedCode = escapeXml(command);
                return {
                    content: encodedCode,
                    description: '[ch]: ' + addParensAsNecessary(encodedCode)
                };
            }));

            suggest(suggestions);
        });
    }

    private omniboxInputEnteredHandler = (text: string) => {
        // evaluate omnibox expression and display results in a notification
        text = addParensAsNecessary(text);
        this.globalState.omniboxHistory.addCommandToHistory(text);
        this.globalState.eventPageInterpreter.arep(text, this.omniboxEnvOverride).then(result => {
            console.log('Omnibox evalutation result:', result);
        }).catch(e => {
            console.error('Omnibox evaluation error:', e);
        });
    }

    public openEditor(inNewWindow: boolean = true, fileName?: string) {
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
                browser.tabs.create({ url: './pages/editor.html' + (fileName ? `#${fileName}` : '') });
            }
        });
    }
}