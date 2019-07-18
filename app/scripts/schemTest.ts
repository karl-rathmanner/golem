import { browser } from 'webextension-polyfill-ts';
import { EnvSetupMap } from './schem/env';
import { pr_str } from './schem/printer';
import { tokenize } from './schem/reader';
import { Schem } from './schem/schem';
import { isSchemKeyword, isSchemString, isSchemSymbol } from './schem/typeGuards';
import { AnySchemType, SchemList, SchemNil, SchemString } from './schem/types';
import { Settings } from './Settings';
import { CommandHistory } from './utils/commandHistory';
import { Key } from './utils/Key.enum';


document.addEventListener("DOMContentLoaded", () =>  {
    console.log('added');

    const inputElement = document.getElementById('input') as HTMLTextAreaElement;
    const commandHistory = new CommandHistory();
    const interpreter = new Schem();

    let tokenAtCursorPosition: string;
    let cursorPositionInToken: number;
    let autocompleteSuggestions: string[] = [];
    let selectedSuggestion: number = -1;
    let lastManuallyTypedToken: string;

    Settings.loadSettings().then(s => {
        interpreter.arep(s.runCommands, envOverwrites);
    });

    const separatorPresets: any = {
        'n': '\n',
        '-': '\n─────────────────────────────────────────────────────────────────────────────────────────────────────\n',
        '=': '\n═════════════════════════════════════════════════════════════════════════════════════════════════════\n',
        'lenny': '\n─────────────────────────────────────────────────────────────────────────────────────────────────\n ( ͡° ͜ʖ ͡°)  ( ͡☉ ͜ʖ ͡☉)  ᕕ( ͡° ͜ʖ ͡°)ᕗ  ᕙ( ͡° ͜ʖ ͡°)ᕗ  ᕦ( ͡° ͜ʖ ͡°)ᕤ  (ノ͡° ͜ʖ ͡°)ノ︵┻┻      ┬─┬ ノ( ゜-゜ノ) \n─────────────────────────────────────────────────────────────────────────────────────────────────\n',
    };

    let currentSeparator = '\n';

    // example for an envOverwrite
    const envOverwrites: EnvSetupMap = {
        'notify': (...args: AnySchemType[]) => {
            const msg: string = (args.map(async (element) => {
                return await pr_str(element, true);
            }).join(' '));
            browser.runtime.sendMessage({ action: 'notify', data: { message: msg } });
            return SchemNil.instance;
        },
        'clear-repl': () => {
            document.getElementById('output')!.textContent = '';
        },
        'set-repl-separator': (char: SchemString) => {
            if (isSchemString(char) && char.length > 0) {
                if (typeof separatorPresets[char.valueOf()] !== 'undefined') {
                    currentSeparator = separatorPresets[char.valueOf()];
                } else {
                    currentSeparator = `\n${char.valueOf().repeat(Math.floor(101 / char.length) + 1).slice(0, 101)}\n`;
                }
            } else {
                currentSeparator = '\n';
            }
            return new SchemString('sure...');
        }
    };

    const changeHandler = (e: Event) => {
        let currentInput = (e.currentTarget != null) ? (e.currentTarget as HTMLTextAreaElement).value : '';
        const cursorPosition = (e.currentTarget as HTMLTextAreaElement).selectionStart;
        currentInput = currentInput.slice(0, cursorPosition) + '☺' + currentInput.slice(cursorPosition);
        const tokens = tokenize(currentInput);

        tokenAtCursorPosition = tokens.reduce((matched, token) => {
            if (token.value.includes('☺')) {
                cursorPositionInToken = token.value.indexOf('☺');
                return token.value.replace('☺', '');
            } else {
                return matched;
            }
        }, '');

        if (selectedSuggestion === -1) {
            lastManuallyTypedToken = tokenAtCursorPosition;
        }

        interpreter.readEval(`(sort-and-filter-by-string-similarity "${lastManuallyTypedToken}" (list-symbols))`).then((suggestions) => {
            if (suggestions instanceof SchemList) {
                const acSuggestionElement = document.getElementById('autocompleteSuggestions')!;
                acSuggestionElement.textContent = '';
                autocompleteSuggestions = [];
                suggestions.map((s, i) => {
                    if (isSchemSymbol(s) || isSchemString(s) || isSchemKeyword(s)) {
                        autocompleteSuggestions.push(s.toString());

                        acSuggestionElement.insertAdjacentHTML('beforeend', `<span class="${(i === selectedSuggestion) ? 'highlightedSuggestion' : 'acSuggestion'}">${s.toString()}</span>`);
                        if (i < suggestions.length - 1) {
                            acSuggestionElement.insertAdjacentHTML('beforeend', '<span class="acDivider">|</span>');
                        }
                    }
                });
            }
        }).catch(() => {
            console.log('autocomplete lokup failed, no biggy.');
        });

    };

    if (inputElement != null) {
        inputElement.focus();
        inputElement.addEventListener("keydown", (e) => {
            if (e.ctrlKey) switch (e.keyCode) {
    
                case Key.UpArrow:
                    commandHistory.previousCommand().then(v => inputElement.value = v);
                    break;
                case Key.DownArrow:
                    inputElement.value = commandHistory.nextCommand();
                    break;
            } else {
                switch (e.keyCode) {
                    case Key.Enter:
                        if (!e.shiftKey) {
                            commandHistory.resetHistoryPosition();
                            const input = inputElement.value;
                            commandHistory.addCommandToHistory(input);
    
                            interpreter.arep(input, envOverwrites).then((result) => {
                                appendToOutput(result);
                            }).catch(e => {
                                console.warn('Exception during Schem evaluation:', e);
                                appendToOutput(e);
                            });
    
                            inputElement.value = '';
                        }
                        break;
    
                    case Key.Tab:
                        if (autocompleteSuggestions.length > 0) {
                            selectedSuggestion += (e.shiftKey) ? -1 : 1;
    
                            if (selectedSuggestion >= autocompleteSuggestions.length) {
                                selectedSuggestion = -1;
                            }
    
                            let replaceWith: string = '';
                            if (selectedSuggestion < -1) selectedSuggestion = -1;
    
                            if (selectedSuggestion < 0) {
                                replaceWith = lastManuallyTypedToken;
                            } else {
                                replaceWith = autocompleteSuggestions[selectedSuggestion];
                            }
    
                            insertAndDeleteRelativeToCursor(e.currentTarget  as HTMLTextAreaElement, replaceWith, cursorPositionInToken, (tokenAtCursorPosition.length - cursorPositionInToken), replaceWith.length - cursorPositionInToken);
                        }
                        e.preventDefault();
                        break;
                    default:
                }
            }
        });
    
        inputElement.addEventListener("keypress", (e) => {
            if (!(e.keyCode === Key.Tab)) {
                selectedSuggestion = -1;
            }
            if (e.currentTarget == null) throw 'eh?';

            switch (e.charCode) {
                case 40: // (
                    insertAndDeleteRelativeToCursor(e.currentTarget as HTMLTextAreaElement, ')', 0);
                    break;
                case 91: // [
                    insertAndDeleteRelativeToCursor(e.currentTarget as HTMLTextAreaElement, ']', 0);
                    break;
                case 123: // {
                    insertAndDeleteRelativeToCursor(e.currentTarget as HTMLTextAreaElement, '}', 0);
                    break;
                case 34: // "
                    insertAndDeleteRelativeToCursor(e.currentTarget as HTMLTextAreaElement, '"', 0);
                    break;
            }
        });

        inputElement.addEventListener("change", changeHandler);
        inputElement.addEventListener("keyup", changeHandler);
        inputElement.addEventListener("paste", changeHandler);

    }

    function appendToOutput(str: string) {
        const outputElement = document.getElementById('output')!;
        outputElement.textContent =  outputElement.textContent + str + currentSeparator;
        outputElement.animate({ scrollTop: outputElement.scrollHeight }, 700);
    }

    function insertAndDeleteRelativeToCursor(target: HTMLTextAreaElement, insert: string, deleteBefore: number = 0, deleteAfter: number = 0, moveCursor: number = 0) {
        const cursorPosition = target.selectionStart as number;
        const currentVal = (typeof target.value === 'string') ? target.value : '';
        const newVal = currentVal.slice(0, cursorPosition - deleteBefore) + insert + currentVal.slice(cursorPosition + deleteAfter);
        target.value = newVal;
        target.setSelectionRange(cursorPosition + moveCursor, cursorPosition + moveCursor);
    }


    function suggestAutocompletion() {
    }

});