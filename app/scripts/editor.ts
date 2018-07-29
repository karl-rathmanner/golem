import * as monaco from 'monaco-editor';
import { browser, Tabs } from '../../node_modules/webextension-polyfill-ts';
import { AddSchemSupportToEditor } from './monaco/schemLanguage';
import { readStr } from './schem/reader';
import { filterRecursively, Schem, schemToJs } from './schem/schem';
import { SchemContextDetails, SchemList, SchemMap, SchemNumber, SchemString, SchemSymbol, SchemType } from './schem/types';
const example = require('!raw-loader!./schemScripts/example.schem');

window.onload = () => {

  const editorEnv: {[symbol: string]: SchemType} = {
    'create-contexts': async (queryInfo: SchemMap, frameId?: SchemNumber) => {
      return requestContextCreation(schemToJs(queryInfo, {keySerialization: 'noPrefix'}), frameId ? frameId.valueOf() : 0).then(contextsOrError => {
        return new SchemList(...contextsOrError);
      });
    },
    'invoke-context-procedure': async (contexts: SchemList, procedureName: SchemSymbol, ...args: SchemType[]) => {
      return new SchemList(...await requestProcedureInvokation(schemToJs(contexts), procedureName.name, args.map(arg => schemToJs(arg))));
    },
    'invoke-js-procedure': async (contexts: SchemList, procedureName: SchemSymbol, ...args: SchemType[]) => {
      return new SchemList(...await requestJSProcedureInvokation(schemToJs(contexts), procedureName.name, args.map(arg => schemToJs(arg))));
    },
    'set-js-property': async (contexts: SchemList, qualifiedPropertyName: SchemSymbol, value: SchemType) => {
      return new SchemList(...await requestJSPropertyUpdate(schemToJs(contexts), qualifiedPropertyName.name, schemToJs(value)));
    }
  };

  let interpreter = new Schem();
  interpreter.replEnv.addMap(editorEnv);
  let ast: SchemType;
  AddSchemSupportToEditor(interpreter);

  let editor = monaco.editor.create(document.getElementById('monacoContainer')!, {
    value: example,
    language: 'schem',
    theme: 'vs-dark'
  });

  editor.focus();

  // remove evalViews and decorations when buffer changes
  editor.getModel().onDidChangeContent((e) => {
    evalDecoration = editor.deltaDecorations(evalDecoration, []);
    editor.changeViewZones(function(changeAccessor) {
      changeAccessor.removeZone(evalZoneId);
    });
  });

  editor.createContextKey('evalEnabled', true);
  let evalZoneId: number;
  let evalDecoration = Array<string>();

  let myBinding = editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KEY_E, function() {

    editor.changeViewZones(function(changeAccessor) {
      let collectionRanges = getRangesOfSchemCollectionsAroundCursor();
      let sourceOfInnermostCollection = editor.getModel().getValueInRange(collectionRanges[collectionRanges.length - 1]);
      const viewZoneAfterLineNumber =  collectionRanges[1].endLineNumber; // collectionRanges[0] contains the '(do ...)' form, so we use the one a level below that

      addEvaluationViewZone(viewZoneAfterLineNumber, '...evaluating...', 'evalWaitingForResultViewZone');

      interpreter.arep(sourceOfInnermostCollection, editorEnv).then((result) => {
        addEvaluationViewZone(viewZoneAfterLineNumber, result, 'evalResultViewZone');
      }).catch(error => {
        addEvaluationViewZone(viewZoneAfterLineNumber, error, 'evalErrorViewZone');
      });

      // highlight evaluated source range
      evalDecoration = editor.deltaDecorations(evalDecoration, [
        { range: collectionRanges[collectionRanges.length - 1], options: { inlineClassName: 'evaluatedSourceDecoration' }}
      ]);

    });
  }, 'evalEnabled');

  function addEvaluationViewZone(afterLineNumber: number, content: string, className: string) {
    let domNode = document.createElement('div');
    domNode.className = 'monaco-lines';
    domNode.classList.add('evalViewZone');
    domNode.classList.add(className);

    // make sure content is always some kind of string
    if (typeof content !== 'string') {
      content = JSON.stringify(content);
    }
    // turn escaped newlines into actual newlines
    content = content.replace(/(\\r)?(\\n)/, '\n');
    const lines = content.split(/\n/g);

    lines.forEach(line => {
      const lineNode = document.createElement('div');
      lineNode.textContent = line;
      domNode.appendChild(lineNode);
    });

    let marginDomNode = createEvalMarginDomNode();

    editor.changeViewZones(function(changeAccessor) {
      changeAccessor.removeZone(evalZoneId);

      evalZoneId = changeAccessor.addZone({
        afterLineNumber: afterLineNumber,
        heightInLines: lines.length,
        domNode: domNode,
        marginDomNode: marginDomNode,
      });
    });
  }

  function createEvalMarginDomNode() {
    let marginDomNode = document.createElement('div');
    marginDomNode.classList.add('line-numbers');
    marginDomNode.classList.add('evalMarginViewZone');
    marginDomNode.textContent = '=>';
    return marginDomNode;
  }

  function getRangesOfSchemCollectionsAroundCursor(): monaco.Range[] {
    const textModel = editor.getModel();
    updateAst();
    // offset cursorIndex by four to compensate for the 'do' form
    const cursorIndex = textModel.getOffsetAt(editor.getPosition()) + 4;

    // I'm sorry...
    const collectionsAroundCursor = filterRecursively(ast, (element) => {
      if ('metadata' in element && element.metadata !== undefined &&
          'sourceIndexStart' in element.metadata && typeof element.metadata.sourceIndexStart === 'number' &&
          'sourceIndexEnd' in element.metadata && typeof element.metadata.sourceIndexEnd === 'number') {
        return (element.metadata.sourceIndexStart < cursorIndex + 1 &&
                element.metadata.sourceIndexEnd > cursorIndex - 1);
      } else {
        return false;
      }
    });

    return collectionsAroundCursor.map(element => {
      let metadata = (element as SchemList).metadata!;
      // offset positions to compensate for the 'do' form (and make endPos include the last character)
      let startPos = textModel.getPositionAt(metadata.sourceIndexStart! - 4);
      let endPos = textModel.getPositionAt(metadata.sourceIndexEnd! - 3);
      return new monaco.Range(
        startPos.lineNumber, startPos.column,
        endPos.lineNumber, endPos.column
      );
    });

  }

  function updateAst() {
    try {
      // wrap source with a 'do' form so every list gets read
      ast = readStr('(do ' + editor.getModel().getValue() + ')', true);
    } catch (e) {
      console.log(e);
    }
  }
};

async function requestContextCreation(queryInfo: Tabs.QueryQueryInfoType, frameId: number): Promise<Array<SchemContextDetails>> {
  return browser.runtime.sendMessage({
    action: 'create-contexts',
    recipient: 'backgroundPage',
    data: {queryInfo: queryInfo, frameId: frameId}}).then(value => {
      if ('error' in value) {
        // messaging worked, but something happened during context creation
        return Promise.reject(value.error.message);
      } else {
        return Promise.resolve(value);
      }
    });
}

async function requestProcedureInvokation(contexts: Array<SchemContextDetails>, procedureName: string, args?: any) {
  const result = await browser.runtime.sendMessage({
    recipient: 'backgroundPage',
    action: 'invoke-context-procedure',
    data: {
      contexts: contexts,
      procedureName: procedureName,
      args: args
    }
  });
  console.log(result);
  return new SchemList(...result.map((e: any) => new SchemString(JSON.stringify(e))));
}
// MEMO: not DRY.
async function requestJSProcedureInvokation(contexts: Array<SchemContextDetails>, qualifiedProcedureName: string, args?: any) {
  const result = await browser.runtime.sendMessage({
    recipient: 'backgroundPage',
    action: 'invoke-js-procedure-in-contexts',
    data: {
      contexts: contexts,
      qualifiedProcedureName: qualifiedProcedureName,
      args: args
    }
  });

  console.log(result);
  return new SchemList(...result.map((e: any) => new SchemString(JSON.stringify(e))));
}

async function requestJSPropertyUpdate(contexts: Array<SchemContextDetails>, qualifiedPropertyName: string, value: any) {
  const result = await browser.runtime.sendMessage({
    recipient: 'backgroundPage',
    action: 'set-js-property-in-contexts',
    data: {
      contexts: contexts,
      qualifiedPropertyName: qualifiedPropertyName,
      value: value
    }
  });

  console.log(result);
  return new SchemList(...result);
}
