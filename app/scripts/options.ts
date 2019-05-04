import { browser } from 'webextension-polyfill-ts';
import { Settings } from './Settings';

document.addEventListener('DOMContentLoaded', () => {
    Settings.loadSettings().then(settings => {
        document.getElementById('configScript')!.innerText = settings.runCommands
        let ta = document.getElementById('configScript') as HTMLTextAreaElement;

        document.getElementById('save')!.onclick = () => {
            Settings.saveSettings({ runCommands: ta.value });
        };
        document.getElementById('load')!.onclick = () => {
            Settings.loadSettings().then(settings => ta.value = settings.runCommands);
        };
        document.getElementById('edit')!.onclick = () => {
            let rcurl = browser.extension.getURL('pages/editor.html#.golemrc');
            browser.tabs.create({ url: rcurl })
        };
    });

});