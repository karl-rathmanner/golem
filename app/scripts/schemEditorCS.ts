import { browser } from 'webextension-polyfill-ts';

(function addEditorToContent() {
    if (window.golem.features.indexOf('schem-interpreter') === -1) {
        throw new Error(`Can't inject feature 'schem-editor', inject 'schem-interpreter' first!`);
    }

    const iframe = document.createElement('iframe');

    iframe.srcdoc = `<!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <title>Schem editor</title>
    <style>
        position: absolute;
        height: 100%;
        width: 100%
    </style>
    <script>
        window.baseUrl = '${browser.runtime.getURL('scripts/monaco')}';
        window.workerUrl = '${browser.runtime.getURL('scripts/monaco/editor.worker.js')}';
    </script>
    <link rel="stylesheet" type="text/css" href="${browser.runtime.getURL('styles/editor.css')}">
    <script src="${browser.runtime.getURL('scripts/editorIframe.js')}"></script>
    </head>
    <body>
    <div id="monacoContainer"></div>
    </body>
    </html>`;

    document.body.appendChild(iframe);
    window.golem.features.push('schem-editor');
})();