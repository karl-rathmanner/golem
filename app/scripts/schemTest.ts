import * as $ from 'jquery';
import { Key } from './utils/Key.enum';
import { Schem } from './schem/schem';
import { SchemBoolean, SchemType, SchemNil } from './schem/types';
import { EnvSetupMap } from './schem/env';
import { pr_str } from './schem/printer';
import { browser } from 'webextension-polyfill-ts';
import { CommandHistory } from './utils/commandHistory';

$.when($.ready).then(() => {
  const inputElement = $('input[name=input]');
  const commandHistory = new CommandHistory();
  const interpreter = new Schem();

  /* example for an envOverwrite
  const envOverwrites: EnvSetupMap = {
    'prn': (...args: SchemType[]) => {
      const msg: string = (args.map((element) => {
        return pr_str(element, true);
      }).join(' '));
      browser.runtime.sendMessage({action: 'notify', message: msg});
      return SchemNil.instance;
    },
  };*/


  inputElement.focus();
  inputElement.keydown((e) => {
    switch (e.keyCode) {
      case Key.Enter:
        commandHistory.resetHistoryPosition();
        const input = $('input[name=input]').val() as string;
        commandHistory.addCommandToHistory(input);

        // const repOutput = rep(input, envOverwrites);
        interpreter.arep(input).then((result) => $('#output').text($('#output').text() + result + '\n'));
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