
import { browser, Runtime } from 'webextension-polyfill-ts';

// IIFE ->
(function addMessageListener() {
  console.log('base cs is listening!');

  browser.runtime.onMessage.addListener((message: {action: string, args: any}, sender: Runtime.MessageSender): Promise<any> => {
    switch (message.action) {
      case 'set-textcontent':
        {
          const element = document.querySelector<Element>(message.args.selector);
          if (element !== null) {
            element.textContent = message.args.value;
          }
        }
        break;
      case 'set-attribute':
        {
          const element = document.querySelector<HTMLElement>(message.args.selector);
          if (element !== null) {
            element.setAttribute(message.args.qualifiedName, message.args.value);
          }
        }
        break;
      case 'set-css':
        const selector = message.args.selector as string;
        const element = document.querySelector<HTMLElement>(message.args.selector);
        if (element !== null) {
        element.style.cssText = message.args.value as string;
        }
        break;
      case 'alert':
        window.alert(message.args[0]);
        return Promise.resolve('did alert');
    }
    return Promise.reject(new Error(`content script was unable to handle the action (${message.action})`));
  });

})();