import { browser, Tabs } from 'webextension-polyfill-ts';
import { VirtualFileSystem } from './virtualFilesystem';
import { GlobalGolemState } from './GlobalGolemState';
import { GlobalGolemFunctions } from './GlobalGolemFunctions';
import { GolemContextMessage } from './contentScriptMessaging';
import { SchemContextInstance } from './schem/types';
import { Glob } from 'glob';

if (process.env.NODE_ENV === 'development') {
    require('chromereload/devonly');
}

window.golem = {
    contextId: 0,
    features: []
};

async function initGolem() {
    console.log(`InitGolem called.`);
    const ggsInstance = await GlobalGolemState.getInstance() || await GlobalGolemState.createInstance();

    // Only initialize golem if necessary. (e.g. the event page was unloaded or the browser was restarted)
    if (!ggsInstance.isReady) {
        console.log(`Starting initialization.`);
        const ggFunctions = new GlobalGolemFunctions(ggsInstance);

        browser.extension.getBackgroundPage().golem.priviledgedContext = {
            globalState: ggsInstance,
            globalFunctions: ggFunctions
        };

        ggsInstance.eventPageInterpreter.replEnv.addMap(ggFunctions.eventPageInterpreterSchemFunctions);
        ggFunctions.addEventPageListeners();
        ggFunctions.executeRunCommands();
        console.log(`Initialization finished.`);
        ggsInstance.isReady = true;
    }
}

// function getGlobalState() {
//     // Get the "actual" event page so we don't create more than one golem instance per browser profile.
//     // (When background.html is opened in one or more tabs, they would each have their own window object. So, calling getBackgroundPage is necessary event though we already "are in" the background page.)
//     const backgroundPage = browser.extension.getBackgroundPage();
//     const ggsInstance = backgroundPage.golem.priviledgedContext == null
//         ? null
//         : backgroundPage.golem.priviledgedContext.globalState;
//     return ggsInstance;
// }

const onTabUpdatedHandler = async (tabId: number, changeInfo: Tabs.OnUpdatedChangeInfoType, tab: Tabs.Tab) => {
    const ggsInstance = await GlobalGolemState.getInstance();

    if (changeInfo.status === 'loading') {
        console.log(ggsInstance != null && ggsInstance.isReady ? 'tab is loading, golem was ready' : 'tab is loading, golem was caught off guard');
    }

    if (ggsInstance == null || !ggsInstance.isReady) {
        await initGolem();
    }

    if (changeInfo.status === 'complete' && ggsInstance != null) {

        const cm = ggsInstance.contextManager;
        await cm.restoreContextsAfterReload(tabId);

        const cidInTab = await GlobalGolemFunctions.getContextInstanceInTab(tabId);
        if (cidInTab != null) {
            // A tab's onUpdated was called but there's still an injected context. Add it to CM?
            await cm.arepInContexts([cidInTab.id], `(if (not= nil (resolve 'on-tab-updated)) (on-tab-updated))`);
        } else for (const contextDefinition of await ggsInstance.getAutoinstantiateContexts()) {
            // A tab probably loaded a new page. Inject a new context if it matches an autoinstantiate definition.
            const id = await cm.prepareContexts(contextDefinition, tabId);
        }
    }
};

browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') console.log('Installed golem.');
    else if (details.reason === 'update') console.log(`Updated golem from Version ${details.previousVersion}.`);
    else if (details.reason === 'browser_update') console.log(`Installed golem after browser update`);
});

// TODO: The onTabUpdatedHandler calls initGolem more often than necessary. Might want to change that.
browser.tabs.onUpdated.addListener(onTabUpdatedHandler);

/// Display some info about the extension's current state when the background page is opened in a tab.
document.addEventListener('DOMContentLoaded', updateBGPInfoPanel);

async function updateBGPInfoPanel() {

    const panel = document.getElementById('bgp-info');
    const vfsInfo = await VirtualFileSystem.listFolderContents('/');
    const globalState = await GlobalGolemState.getInstance();
    const activeContextIds = globalState == null ? null : await globalState!.contextManager.getAllActiveContextIds();

    if (panel != null) {
        panel.innerHTML = (globalState != null && globalState.isReady)
            ? `Number of active contexts: ${activeContextIds!.length}<br>
        Active context ids: ${JSON.stringify(activeContextIds)}<br>
        Registered autoinstantiate context definitions: ${globalState!.autoinstantiateContexts.length}<br>
        Virtual File System root folder contents: <br>${JSON.stringify(vfsInfo)}`
            : `Golem is not yet initialized. :(`;
    }
}