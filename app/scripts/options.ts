// Enable chromereload by uncommenting this line:
// import 'chromereload/devonly';
import { browser } from 'webextension-polyfill-ts';

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('button')!.addEventListener('click', sayHello);
    console.log('options page loaded');
});

function sayHello() {
    browser.runtime.sendMessage('Hello from the other side').then((r) => {
        console.log(r);
    });
}
