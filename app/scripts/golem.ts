import { Schem } from './schem/schem';
import * as $ from 'jquery';

import { CommandHistory } from './utils/commandHistory';
import { Key } from './utils/Key.enum';
import { browser, Runtime } from 'webextension-polyfill-ts';

// load css and schem file as string
import * as iFrameStyle from '!raw-loader!../styles/iFrame.css';

export class Golem {
  private inputBox: JQuery<HTMLElement>;
  private iFrame: JQuery<HTMLIFrameElement>;
  public stopEventPropagation: boolean = false;
  private port: Runtime.Port;

  private constructor() {
  }

  public static async getInstance(): Promise<Golem | undefined> {
    const instance = new Golem();
    await instance.connectToEventPage();
    return instance;
  }

  private async connectToEventPage() {
    console.log('connecting to event page');
    this.port = browser.runtime.connect(void 0, {name: `golem`});

    // this.port.onMessage.addListener(this.onMessageFromEventPage);
    this.port.onMessage.addListener((message: {action: string, data: any}, port: Runtime.Port) => {
      console.log('golem got a message', message);
      switch (message.action) {
        case 'setVal':
        $(message.data.selector).val(message.data.value);
        break;
        case 'click':
        $(message.data.selector).click();
        break;
      }
      return true;
    });

    console.log(this.port);
  }

  private onMessageFromEventPage(message: {action: string, data: any}, port: Runtime.Port) {
    console.log('golem got a message', message);
    switch (message.action) {
      case 'setVal':
        $(message.data.selector).val(message.data.value);
        break;
      case 'click':
        $(message.data.selector).click();
        break;
    }
    return true;
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

  private async arepSchemExpressionByEventPage(expression: string) {
    /*
    * Soooo... the signature for port.postmessage provided by 'webextension-polyfill-ts' is wrong. (in ...\node_modules\webextension-polyfill-ts\src\generated\runtime.ts, line 39)
    * it should be: postMessage(msg: any): void
    * instead of:   postMessage(): void
    * It would be neat if this was fixable via declaration merging/patching, but because of the way the polyfill module is set up, that seems to be impossible.
    * See: https://github.com/Microsoft/TypeScript/issues/18877
    * Until either the polyfill module is fixed or someone has a better idea, I'll just cast that method to 'any' and be done with it. I already wasted four hours on this. :|
    */
    (this.port.postMessage as any)({action: 'arep', schemExpression: expression});
  }

  private createInputBox() {
    this.inputBox = this.iFrame.contents().find('body').append('<div id="golemInputBox"><textarea id="golemInputTextArea" cols="42" rows="1"></textarea></div>') as JQuery<HTMLElement>;

    const inputField =  $(this.inputBox).find('#golemInputTextArea');
    const commandHistory = new CommandHistory();

    // resize inputField to match the number of lines
    inputField.on('change keyup paste', () => {
      const inputFieldContent = (inputField.val() as string);
      const numberOfLinebreaksOrEnds = (inputFieldContent.match(/(\n|$)/g) || []).length;
      const lines = inputFieldContent.match(/(.+)(\n|$)/g) || [''];
      const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 42);

      inputField.attr('rows', Math.min(42, Math.max(1, numberOfLinebreaksOrEnds)));
      inputField.attr('cols', Math.min(128, Math.max(1, longestLine + 1)));
    });

    this.inputBox.keydown((e) => {
      if (e.keyCode === Key.Escape) {
        this.hideinputBox();
      }

      if (e.ctrlKey || e.altKey) switch (e.keyCode) {
        case Key.Enter:
            commandHistory.resetHistoryPosition();
            const input = inputField.val() as string;
            commandHistory.addCommandToHistory(input);
            this.arepSchemExpressionByEventPage(input);
            inputField.val('');
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
        this.iFrame.contents().find('textarea').focus();
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