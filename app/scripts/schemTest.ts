import * as $ from 'jquery';
import { Key } from './Key.enum';
import { rep } from './schem/schem';
import { SchemBoolean, SchemType, SchemNil } from './schem/types';
import { EnvSetupMap } from './schem/env';
import { pr_str } from './schem/printer';
import { browser } from 'webextension-polyfill-ts';

$.when($.ready).then(() => {
  const inputElement = $('input[name=input]');
  inputElement.focus();
  inputElement.keydown((e) => {
    if (e.keyCode === Key.Enter) {
      const input = $('input[name=input]').val() as string;

      const overwrites: EnvSetupMap = {
        'prn': (...args: SchemType[]) => {
          const msg: string = (args.map((element) => {
            return pr_str(element, true);
          }).join(' '));
          browser.runtime.sendMessage({action: 'notify', message: msg});
          return SchemNil.instance;
        },
      };
      const repOutput = rep(input, overwrites);
      $('#output').text($('#output').text() + repOutput + '\n');
      $('input[name=input]').val('');
    }
  });
});