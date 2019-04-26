import { browser } from 'webextension-polyfill-ts';
import { VirtualFileSystem } from './virtualFilesystem';
import { GlobalGolemState } from './GlobalGolemState';
import { GlobalGolemFunctions } from './GlobalGolemFunctions';

if (process.env.NODE_ENV === 'development') {
  require('chromereload/devonly');
}

window.golem = {
  contextId: 0,
  features: []
};

async function initGolem() {
  const ggsInstance = await GlobalGolemState.getInstance();

  // Prevent initialization from being run multiple times. (e.g. when the user opens new windows)
  if (!ggsInstance.isReady) {
    const ggFunctions = new GlobalGolemFunctions(ggsInstance);

    window.golem.priviledgedContext = {
      globalState: ggsInstance,
      globalFunctions: ggFunctions
    };
  
    window.golem.priviledgedContext!.globalFunctions = ggFunctions;
    ggsInstance.eventPageInterpreter.replEnv.addMap(ggFunctions.eventPageInterpreterSchemFunctions);
    ggFunctions.addEventPageListeners();
    ggFunctions.executeRunCommands();
    console.log(`Initialization finished.`);
    ggsInstance.isReady = true;
  }
}

browser.windows.onCreated.addListener(initGolem);

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') console.log('Installed golem.');
  else if (details.reason === 'update') console.log(`Updated golem from Version ${details.previousVersion}.`);
  else if (details.reason === 'browser_update') console.log(`Installed golem after browser update`);
  initGolem();
});

/// Display some info about the extension's current state when the background page is opened in a tab.

document.addEventListener('DOMContentLoaded', updateBGPInfoPanel);

async function updateBGPInfoPanel() {
  
  const panel = document.getElementById('bgp-info');
  const vfsInfo = await VirtualFileSystem.listFolderContents('/');
  const bgp = browser.extension.getBackgroundPage();
  const globalState = (bgp.golem.priviledgedContext == null) ? null : bgp.golem.priviledgedContext.globalState;

  if (panel != null) {
    panel.innerHTML = (globalState != null && globalState.isReady) 
      ? `active contexts: ${globalState!.contextManager.activeContextInstances.size}<br>
        registered autoinstantiate context definitions: ${globalState!.autoinstantiateContexts.length}<br>
        Virtual File System root folder contents: <br>${JSON.stringify(vfsInfo)}`
      : `golem is not yet initialized`;
  }
}