import * as $ from 'jquery';
import { Key } from './Key.enum';
import { arep } from './schem/schem';
import { SchemBoolean, SchemType, SchemNil } from './schem/types';
import { EnvSetupMap } from './schem/env';
import { pr_str } from './schem/printer';
import { browser } from 'webextension-polyfill-ts';

class CommandHistory {
  private nthToLastPosition = 0;
  private commandHistory = [];

  private async loadCommandHistory() {
    await browser.storage.local.get({commandHistory: []}).then(results => {
      let commandHistory = results.commandHistory;
      if (!(commandHistory instanceof Array)) {
        console.warn('command History empty or corrupted');
      }
      this.commandHistory = commandHistory;
      return true;
    });
  }

  async previousCommand(): Promise<string> {
    await this.loadCommandHistory();
    this.nthToLastPosition = Math.min(this.commandHistory.length, this.nthToLastPosition + 1);
    return this.commandHistory[this.commandHistory.length - this.nthToLastPosition];
  }

  nextCommand(): string {
    this.loadCommandHistory();
    this.nthToLastPosition = Math.max(0, this.nthToLastPosition - 1);
    return this.nthToLastPosition === 0 ? '' : this.commandHistory[this.commandHistory.length - this.nthToLastPosition];
  }

  resetHistoryPosition() {
    this.nthToLastPosition = 0;
  }

  addCommandToHistory(command: string) {
    if (command.length === 0) return; // ignore empty commands

    // this happens asynchronously, but I don't care if commands end up in the wrong order when you add two of them within miliseconds of each other
    browser.storage.local.get({commandHistory: []}).then(results => {
      if (!(results.commandHistory instanceof Array)) {
        results.commandHistory = new Array();
      }
      results.commandHistory.push(command);
      browser.storage.local.set(results);
    });
  }
}

$.when($.ready).then(() => {
  const inputElement = $('input[name=input]');
  const commandHistory = new CommandHistory();

  const envOverwrites: EnvSetupMap = {
    'prn': (...args: SchemType[]) => {
      const msg: string = (args.map((element) => {
        return pr_str(element, true);
      }).join(' '));
      browser.runtime.sendMessage({action: 'notify', message: msg});
      return SchemNil.instance;
    },
  };


  inputElement.focus();
  inputElement.keydown((e) => {
    switch (e.keyCode) {
      case Key.Enter:
        commandHistory.resetHistoryPosition();
        const input = $('input[name=input]').val() as string;
        commandHistory.addCommandToHistory(input);

        // const repOutput = rep(input, envOverwrites);
        arep(input, envOverwrites).then((result) => $('#output').text($('#output').text() + result + '\n'));
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