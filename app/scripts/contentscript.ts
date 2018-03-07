// Enable chromereload by uncommenting this line:
import 'chromereload/devonly';
import { browser } from 'webextension-polyfill-ts';

console.log(`Hello from the content script`);

// let printme: Element;
let printme = document.createElement('div');

printme.appendChild(document.createTextNode('Behold! I am to be printed! I hope.'));
printme.setAttribute('class', 'printable');
document.body.appendChild(printme);

console.log(printme);
