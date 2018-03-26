import * as $ from 'jquery';
import { Key } from './Key.enum';
import { rep } from './schem/schem';

$.when($.ready).then(() => {
  const inputElement = $('input[name=input]');
  inputElement.focus();
  inputElement.keydown((e) => {
    if (e.keyCode === Key.Enter) {
      const input = $('input[name=input]').val() as string;

      $('#output').append(rep(input) + '<br/>');
      $('input[name=input]').val('');
    }
  });
});