
import { browser, Runtime } from 'webextension-polyfill-ts';
import { GolemContextMessage } from './contentScriptMessaging';
import { AvailableSchemContextFeatures } from './contextManager';

(function addMessageListener() {
  console.log('base content script injected');
  window.golem.features = [];

  browser.runtime.onMessage.addListener((message: GolemContextMessage, sender: Runtime.MessageSender): Promise<any> => {
    switch (message.action) {
      case 'has-base-content-script': {
        return Promise.resolve(true);
      }
      case 'has-feature': {
        const feature: AvailableSchemContextFeatures = message.args;
        const hasFeature = window.golem.features != null && window.golem.features.indexOf(feature) !== -1;
        return Promise.resolve(hasFeature);
      }
      case 'invoke-context-procedure': {
        const procedureName = message.args.procedureName;
        if (window.golem != null && window.golem.injectedProcedures != null && window.golem.injectedProcedures.has(procedureName)) {
          console.log(`invoking procedure ${procedureName}`);
          const result = window.golem.injectedProcedures.get(procedureName)!(...message.args.procedureArgs);
          return Promise.resolve(result);
        } else {
          const reason = `tried to invoke procedure ${procedureName}, but it probably wasn't injected correctly`;
          return Promise.reject(reason);
        }
      }
      case 'invoke-js-procedure': {
        const blackList = ['eval', 'innerHTML'];
        const namespaces: string[] = message.args.qualifiedProcedureName.split('.');
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
            return Promise.resolve(parentObjectForProcedure[procedureName](message.args.procedureArgs));
          } catch (e) {
            return Promise.reject('Js procedure invocation failed with message: ' + JSON.stringify(e));
          }
        }
      }
      case 'set-js-property': {
        const blackList = ['innerHTML'];
        const namespaces: string[] = message.args.qualifiedPropertyName.split('.');
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
            return Promise.resolve(parentObjectForProperty[propertyName] = message.args.value);
          } catch (e) {
            return Promise.reject('Js procedure invocation failed with message: ' + JSON.stringify(e));
          }
        }
      }
    }
    return Promise.reject(new Error(`content script was unable to handle the action (${message.action})`));
  });

})();