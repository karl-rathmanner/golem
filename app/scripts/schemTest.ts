import * as $ from 'jquery';
import { Key } from './utils/Key.enum';
import { Schem } from './schem/schem';
import { SchemBoolean, SchemType, SchemNil, SchemString, SchemList, SchemSymbol, SchemKeyword } from './schem/types';
import { EnvSetupMap } from './schem/env';
import { pr_str } from './schem/printer';
import { browser } from 'webextension-polyfill-ts';
import { CommandHistory } from './utils/commandHistory';
import { Settings } from './options';
import { tokenize } from './schem/reader';

$.when($.ready).then(() => {
  const inputElement = $('#input');
  const commandHistory = new CommandHistory();
  const interpreter = new Schem();

  let tokenAtCursorPosition: string;
  let cursorPositionInToken: number;
  let autocompleteSuggestions: string[] = [];
  let selectedSuggestion: number = -1;
  let lastManuallyTypedToken: string;

  Settings.loadSettings().then(s => {
    interpreter.arep(s.configScript, envOverwrites);
  });

  const separatorPresets: any = {
    'n': '\n',
    '-': '\n───────────────────────────────────────────────────────────────────────────\n',
    '=': '\n═══════════════════════════════════════════════════════════════════════════\n',
    'lenny': '\n───────────────────────────────────────────────────────────────────────────\n ( ͡° ͜ʖ ͡°)  ( ͡☉ ͜ʖ ͡☉)  ᕕ( ͡° ͜ʖ ͡°)ᕗ  ᕙ( ͡° ͜ʖ ͡°)ᕗ  ᕦ( ͡° ͜ʖ ͡°)ᕤ  (ノ͡° ͜ʖ ͡°)ノ︵┻┻\n───────────────────────────────────────────────────────────────────────────\n',
  };

  let currentSeparator = '\n';

  // example for an envOverwrite
  const envOverwrites: EnvSetupMap = {
    'notify': (...args: SchemType[]) => {
      const msg: string = (args.map((element) => {
        return pr_str(element, true);
      }).join(' '));
      browser.runtime.sendMessage({action: 'notify', data: {message: msg}});
      return SchemNil.instance;
    },
    'clearRepl': () => {
      $('#output').text('');
    },
    'setReplSeparator': (char: SchemString) => {
      if (char instanceof SchemString && char.length > 0) {
        if (typeof separatorPresets[char.valueOf()] !== 'undefined') {
            currentSeparator = separatorPresets[char.valueOf()];
        } else {
          currentSeparator = `\n${char.valueOf().repeat( Math.floor(75 / char.length)) }\n`;
        }
      } else {
        currentSeparator = '\n';
      }
      return new SchemString('sure...');
    }
  };

  inputElement.focus();
  inputElement.keydown((e) => {
    if (e.ctrlKey) switch (e.keyCode) {
      case Key.Enter:
        commandHistory.resetHistoryPosition();
        const input = inputElement.val() as string;
        commandHistory.addCommandToHistory(input);

        interpreter.arep(input, envOverwrites).then((result) => {

          $('#output').text($('#output').text() + result + currentSeparator);
          $('#output').animate({scrollTop: $('#output').prop('scrollHeight')}, 700);
        });

        inputElement.val('');
        break;

      case Key.UpArrow:
      commandHistory.previousCommand().then(v => inputElement.val(v));
        break;
      case Key.DownArrow:
        inputElement.val(commandHistory.nextCommand());
        break;
    } else {
      switch (e.keyCode) {
        case Key.Tab:
          if (autocompleteSuggestions.length > 0) {
            selectedSuggestion += (e.shiftKey) ? -1 : 1;

            if (selectedSuggestion >= autocompleteSuggestions.length) {
              selectedSuggestion = -1;
            }

            let replaceWith: string = '';
            if (selectedSuggestion < 0) {
              replaceWith = lastManuallyTypedToken;
            } else {
              replaceWith = autocompleteSuggestions[selectedSuggestion];
            }

            insertAndDeleteRelativeToCursor(e.currentTarget, replaceWith, cursorPositionInToken, (tokenAtCursorPosition.length - cursorPositionInToken), replaceWith.length - cursorPositionInToken);
          }
          e.preventDefault();
          break;
        default:
      }
    }
  });

  inputElement.keypress((e) => {
    if (!(e.keyCode === Key.Tab)) {
      selectedSuggestion = -1;
    }
    switch (e.charCode) {
      case 40: // (
        insertAndDeleteRelativeToCursor(e.currentTarget, ')', 0);
        break;
      case 91: // [
        insertAndDeleteRelativeToCursor(e.currentTarget, ']', 0);
        break;
      case 123: // {
        insertAndDeleteRelativeToCursor(e.currentTarget, '}', 0);
        break;
      case 34: // "
        insertAndDeleteRelativeToCursor(e.currentTarget, '"', 0);
        break;
    }
  });

  function insertAndDeleteRelativeToCursor(target: HTMLElement, insert: string, deleteBefore: number = 0, deleteAfter: number = 0, moveCursor: number = 0) {
    const cursorPosition = ($(target).prop('selectionStart') as number);
    const currentVal = (typeof $(target).val() === 'string') ? $(target).val() as string : '';
    const newVal = currentVal.slice(0, cursorPosition - deleteBefore) + insert + currentVal.slice(cursorPosition + deleteAfter);
    $(target).val(newVal);
    (target as HTMLInputElement).setSelectionRange(cursorPosition + moveCursor, cursorPosition + moveCursor);
  }

  inputElement.on('change keyup paste', (e) => {

    let currentInput = (typeof $(e.currentTarget).val() === 'string') ? $(e.currentTarget).val() as string : '';
    const cursorPosition = $(e.currentTarget).prop('selectionStart') as number;
    currentInput = currentInput.slice(0, cursorPosition) + '☺' + currentInput.slice(cursorPosition);
    const tokens = tokenize(currentInput);

    tokenAtCursorPosition = tokens.reduce((matched, token) => {
      if (token.includes('☺')) {
        cursorPositionInToken = token.indexOf('☺');
        return token.replace('☺', '');
      } else {
        return matched;
      }
    }, '');

    if (selectedSuggestion === -1) {
      lastManuallyTypedToken = tokenAtCursorPosition;
    }

    interpreter.readEval(`(sortAndFilterByStringSimilarity "${lastManuallyTypedToken}" (listSymbols))`).then((suggestions) => {
      if (suggestions instanceof SchemList) {
        $('#autocompleteSuggestions').empty();
        autocompleteSuggestions = [];
        suggestions.map((s, i) => {
          if (s instanceof SchemSymbol || s instanceof SchemString || s instanceof SchemKeyword) {
            autocompleteSuggestions.push(s.stringValueOf());

            $('#autocompleteSuggestions').append(`<span class="${(i === selectedSuggestion) ? 'highlightedSuggestion' : 'acSuggestion'}">${s.stringValueOf()}</span>`);
            if (i < suggestions.length - 1) {
              $('#autocompleteSuggestions').append('<span class="acDivider">|</span>');
            }
          }
        });
      }
    });

  });

  function suggestAutocompletion() {
  }

});