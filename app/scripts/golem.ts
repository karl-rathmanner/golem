import { Schem } from './schem/schem';
import * as $ from 'jquery';

import { CommandHistory } from './utils/commandHistory';
import { Key } from './utils/Key.enum';
import { browser } from 'webextension-polyfill-ts';

// load css and schem file as string
import * as iFrameStyle from '!raw-loader!../styles/iFrame.css';
import * as someSchem from '!raw-loader!./schemScripts/printStuff.schem';

export class Golem {
  private inputBox: JQuery<HTMLElement>;
  private iFrame: JQuery<HTMLIFrameElement>;
  private schemInterpreter = new Schem();
  public stopEventPropagation: boolean = false;

  constructor() {
  }

  private async createGolemIFrame() {
    $('body').append(`<iframe id="golemIframe" srcdoc="<html><head><style>${iFrameStyle}</style></head><body></body></html>"></iframe>`);

    return new Promise(resolve => {
      $('#golemIframe').on('load', () => {
        this.iFrame = $('#golemIframe') as JQuery<HTMLIFrameElement>;
        resolve();
      });
    });
  }

  private createInputBox() {

    this.inputBox = this.iFrame.contents().find('body').append('<div id="golemInputBox"><input type="text" id="golemInputField"/></div>') as JQuery<HTMLElement>;

    const inputField =  $(this.inputBox).find('#golemInputField');
    inputField.val(someSchem as any);

    const commandHistory = new CommandHistory();
    this.inputBox.keydown((e) => {
      switch (e.keyCode) {
        case Key.Enter:
          commandHistory.resetHistoryPosition();
          const input = inputField.val() as string;
          commandHistory.addCommandToHistory(input);

          this.schemInterpreter.arep(input).then((result) => console.log(result));
          inputField.val('');
          this.hideinputBox();
          break;
        case Key.Escape:
          this.hideinputBox();
          break;
        case Key.UpArrow:
        commandHistory.previousCommand().then(v => inputField.val(v));
          break;
        case Key.DownArrow:
          inputField.val(commandHistory.nextCommand());
          break;
      }
    });
  }

  async showInputBox() {
    if (!this.iFrame) {
      await this.createGolemIFrame();
      this.createInputBox();
    }

    return new Promise((resolve) => {
      this.iFrame.show(0, () => {
        this.iFrame.contents().find('input').focus();
        resolve();
      });
    });
  }

  hideinputBox() {
      this.iFrame.hide();
  }

  toggleInputBoxVisibility() {
    if (!this.iFrame || !this.iFrame.is(':visible')) {
      this.showInputBox();
    } else {
      this.hideinputBox();
    }
  }

  addEventListeners() {
    const golemInstance = this;
    window.addEventListener('keydown', function(event) {
      console.log(event.keyCode);

      if (golemInstance.stopEventPropagation) {
          event.stopImmediatePropagation();
      }
    }, true);
  }
}