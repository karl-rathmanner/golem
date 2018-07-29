
import { browser, Runtime } from 'webextension-polyfill-ts';

(function addMessageListener() {

  browser.runtime.onMessage.addListener((message: {action: string, data: any, args: any}, sender: Runtime.MessageSender): Promise<any> => {
    console.log(`I'm listening!`);

    switch (message.action) {
      case 'invoke-context-procedure': {
        const procedureName = message.data.procedureName;
        if (window.golem != null && window.golem.injectedProcedures != null && window.golem.injectedProcedures.has(procedureName)) {
          console.log(`invoking procedure ${procedureName}`);
          const result = window.golem.injectedProcedures.get(procedureName)!(...message.data.args);
          return Promise.resolve(result);
        } else {
          const reason = `tried to invoke procedure ${procedureName}, but it probably wasn't injected correctly`;
          return Promise.reject(reason);
        }
      }
      case 'invoke-javascript-procedure': {
        const blackList = ['eval', 'innerHTML'];
        const namespaces: string[] = message.data.qualifiedProcedureName.split('.');
        const procedureName: string = namespaces.pop()!;
        let parentObjectForProcedure: any = window;

        // "descend" into namespaces
        for (let i = 0; i < namespaces.length; i++) {
          parentObjectForProcedure = parentObjectForProcedure[namespaces[i]];
        }

        if (blackList.some(element => procedureName.lastIndexOf(element) > -1)) {
          return Promise.reject('Tried to invoke a blacklisted JS function.');
        } else {
          try {
            return Promise.resolve(parentObjectForProcedure[procedureName](message.data.args));
          } catch (e) {
            return Promise.reject('Js procedure invocation failed with message: ' + JSON.stringify(e));
          }
        }
      }
      case 'set-javascript-property': {
        const blackList = ['innerHTML'];
        const namespaces: string[] = message.data.qualifiedPropertyName.split('.');
        const propertyName: string = namespaces.pop()!;
        let parentObjectForProperty: any = window;

        // "descend" into namespaces
        for (let i = 0; i < namespaces.length; i++) {
          parentObjectForProperty = parentObjectForProperty[namespaces[i]];
        }

        if (blackList.some(element => propertyName.lastIndexOf(element) > -1)) {
          return Promise.reject('Tried to invoke a blacklisted JS function.');
        } else {
          try {
            return Promise.resolve(parentObjectForProperty[propertyName] = message.data.value);
          } catch (e) {
            return Promise.reject('Js procedure invocation failed with message: ' + JSON.stringify(e));
          }
        }
      }
    }
    return Promise.reject(new Error(`content script was unable to handle the action (${message.action})`));
  });

})();