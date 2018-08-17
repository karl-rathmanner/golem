import * as iFrameStyle from '!raw-loader!../styles/tinyRepl.css';
import { CommandHistory } from './utils/commandHistory';
import { Key } from './utils/Key.enum';

export class TinyRepl {
  private iFrame?: HTMLIFrameElement;
  private inputDiv: HTMLElement;

  private async createDomElements() {
    this.iFrame = document.createElement('iframe');
    this.iFrame.id = 'golem-iframe';

    // set the iframe's style explicitly
    this.iFrame.style.cssText = `
      height: 100%;
      width: 100%;
      position: fixed;
      z-index: 9001;
      left: 0;
      top: 0;
      visibility: hidden;
    `;

    // setting the iframe content using srcdoc so it doesn't get treated as cross domain
    this.iFrame.srcdoc = `
      <html>
        <head>
          <style type="text/css">
            ${iFrameStyle}
          </style>
        </head>
        <body>
          <div id="golemInputBox">
            <textarea id="golemInputTextArea" cols="42" rows="1"></textarea>
          </div>
        </body>
      </html>
    `;

    document.body.appendChild(this.iFrame);

    // assigning scrdoc is not synchronous, make this function awaitable
    return new Promise((resolve, reject) => {
      this.iFrame!.addEventListener('load', () => {
        // (also, query selector can't select anything until the document finished loading)
        this.inputDiv = this.iFrame!.contentDocument!.querySelector<HTMLElement>('#golemInputBox')!;
        resolve();
      });
    });
  }

  private setupInput() {

    const inputField =  this.inputDiv.querySelector<HTMLInputElement>('#golemInputTextArea')!;
    const commandHistory = new CommandHistory();

    // resizes inputField to match the number of lines
    const resizeInputBoxToFitContent = () => {
      const inputFieldContent = inputField.value;
      const numberOfLinebreaksOrEnds = (inputFieldContent.match(/(\n|$)/g) || []).length;
      const lines = inputFieldContent.match(/(.+)(\n|$)/g) || [''];
      const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 42);

      inputField.setAttribute('rows', Math.min(42, Math.max(1, numberOfLinebreaksOrEnds)).toString());
      inputField.setAttribute('cols', Math.min(128, Math.max(1, longestLine + 1)).toString());
    };

    inputField.addEventListener('change', resizeInputBoxToFitContent);
    inputField.addEventListener('keyup', resizeInputBoxToFitContent);
    inputField.addEventListener('paste', resizeInputBoxToFitContent);

    this.inputDiv.addEventListener('keydown', (e) => {
      if (e.keyCode === Key.Escape) {
        this.hideinputBox();
      }

      // keeping ctrl, alt or shift pressed enables multi-line editing
      if (!(e.ctrlKey || e.altKey || e.shiftKey)) switch (e.keyCode) {
        case Key.Enter:
            commandHistory.resetHistoryPosition();
            const input = inputField.value;
            commandHistory.addCommandToHistory(input);
            this.evalAndLogOutput(input);

            inputField.value = '';
            this.hideinputBox();
          break;
        case Key.UpArrow:
          commandHistory.previousCommand().then(v => {
            inputField.value = v;
          });
          break;
        case Key.DownArrow:
          inputField.value = commandHistory.nextCommand();
          break;
      }
    });
  }

  async showInputBox() {
    if (!this.iFrame) {
      await this.createDomElements();
      this.setupInput();
    }

    return new Promise(() => {
      if (this.iFrame != null) {
        this.iFrame.style.visibility = 'visible';
        this.inputDiv.querySelector('textarea')!.focus();
      }
    });
  }

  hideinputBox() {
      this.iFrame!.style.visibility = 'hidden';
  }

  toggleInputBoxVisibility() {
    if (!this.iFrame || !(this.iFrame.style.visibility === 'visible')) {
      this.showInputBox();
    } else {
      this.hideinputBox();
    }
  }

  private async evalAndLogOutput(expression: string) {
    try {
      const result = await window.golem.interpreter!.arep(expression);
      console.log(result);
    } catch (e) {
      console.log(e);
    }
  }
}