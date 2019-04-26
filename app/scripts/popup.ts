import { browser } from 'webextension-polyfill-ts';
import { GlobalGolemState } from './GlobalGolemState';

if (process.env.NODE_ENV === 'development') {
  require('chromereload/devonly');
}

document.addEventListener("DOMContentLoaded", async () => {

  const infoElement = document.getElementById('info');
  if (infoElement != null) {
    const ggsInstance = await GlobalGolemState.getInstance();
  
    const currentWindow = await browser.windows.getCurrent();
    const activeTabsInWindow = await browser.tabs.query({active: true, windowId: currentWindow.id});
    const localContextIds = await ggsInstance.contextManager.getMatchingContextIdsFromCache({tabId: activeTabsInWindow[0].id, windowId: currentWindow.id})
    console.log(ggsInstance, currentWindow, activeTabsInWindow, localContextIds);

    infoElement.innerHTML = localContextIds.length > 0 ? 
        'Active contexts in this tab:<br/>' + localContextIds.join(', '):
        'No active contexts in this tab.';
  }});