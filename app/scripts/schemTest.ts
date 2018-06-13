import * as $ from 'jquery';
import { Key } from './utils/Key.enum';
import { Schem } from './schem/schem';
import { SchemBoolean, SchemType, SchemNil, SchemString } from './schem/types';
import { EnvSetupMap } from './schem/env';
import { pr_str } from './schem/printer';
import { browser } from 'webextension-polyfill-ts';
import { CommandHistory } from './utils/commandHistory';

$.when($.ready).then(() => {
  const inputElement = $('input[name=input]');
  const commandHistory = new CommandHistory();
  const interpreter = new Schem();

  const separatorPresets: any = {
    'n': '\n',
    '-': '\n───────────────────────────────────────────────────────────────────────────\n',
    '=': '\n═══════════════════════════════════════════════════════════════════════════\n',
    'lenny': '\n───────────────────────────────────────────────────────────────────────────\n ( ͡° ͜ʖ ͡°)  ( ͡☉ ͜ʖ ͡☉)  ᕕ( ͡° ͜ʖ ͡°)ᕗ  ᕙ( ͡° ͜ʖ ͡°)ᕗ  ᕦ( ͡° ͜ʖ ͡°)ᕤ  (ノ͡° ͜ʖ ͡°)ノ︵┻┻\n───────────────────────────────────────────────────────────────────────────\n',
  }

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
          currentSeparator = `\n${char.valueOf().repeat( Math.floor(77/char.length)) }\n`;
        }
      } else {
        currentSeparator = '\n';
      }
      return new SchemString('sure...');
    }
  };

  inputElement.focus();
  inputElement.keydown((e) => {
    switch (e.keyCode) {
      case Key.Enter:
        commandHistory.resetHistoryPosition();
        const input = $('input[name=input]').val() as string;
        commandHistory.addCommandToHistory(input);

        // const repOutput = rep(input, envOverwrites);
        interpreter.arep(input, envOverwrites).then((result) => {
          
          $('#output').text($('#output').text() + result + currentSeparator);
          $('#output').animate({scrollTop: $('#output').prop('scrollHeight')}, 700);
        });

        // $('#output').text($('#output').text() + repOutput + '\n');
        $('input[name=input]').val('');
        break;

      case Key.UpArrow:
      commandHistory.previousCommand().then(v => $('input[name=input]').val(v));
        break;
      case Key.DownArrow:
        $('input[name=input]').val(commandHistory.nextCommand());
        break;
    }

  });
});