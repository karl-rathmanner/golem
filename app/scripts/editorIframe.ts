import { SchemEditor } from './SchemEditor';
import { Schem } from './schem/schem';

window.onload = () => {

    (window as any).MonacoEnvironment = {
        getWorkerUrl: function(workerId: any, label: any) {
            return 'data:text/javascript;charset=utf-8,' +
            encodeURIComponent(`
            self.MonacoEnvironment = {
                baseUrl: '${(window as any).baseUrl}'
            };
            importScripts('${(window as any).workerUrl}');`);
            // )}`;
        }
        // getWorkerUrl: function(workerId: any, label: any) {
        //       return (window as any).workerUrl;
        //     }
        // };
    };

    const interpreter = new Schem();
    interpreter.loadCore().then(
        () => {
            const editor = new SchemEditor(document.getElementById('monacoContainer')!, { language: 'schem', expandContainer: true });
        }
    );
    
    
};