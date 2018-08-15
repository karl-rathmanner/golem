import * as monaco from 'monaco-editor';
import { EventPageActionName, eventPageMessagingSchemFunctions } from './eventPageMessaging';
import { AddSchemSupportToEditor } from './monaco/schemLanguage';
import { readStr, unescape as schemUnescape } from './schem/reader';
import { filterRecursively, Schem } from './schem/schem';
import { SchemList, SchemType, SchemString, SchemBoolean } from './schem/types';
import { getHTMLElementById } from './utils/domManipulation';
import { VirtualFileSystem } from './virtualFilesystem';

const example = require('!raw-loader!./schemScripts/example.schem');

window.onload = () => {

  const messagingWithEventPage: {[symbolName in EventPageActionName]?: SchemType} = eventPageMessagingSchemFunctions;
  const editorManipulation = {
    'editor-load-script': async (qualifiedFileName: SchemString) => {
      let candidate = await VirtualFileSystem.readObject(qualifiedFileName.valueOf());
      if (typeof candidate === 'string') {
        editor.setValue(candidate);
        return SchemBoolean.true;
      } else {
        throw new Error(`Can only load strings into the editor.`);
      }
    },
    'editor-save-script': async (qualifiedFileName: SchemString) => {
      const script = editor.getValue();
      const result =  await VirtualFileSystem.createObject(qualifiedFileName.valueOf(), script, true)
        .then(() => {
          console.log('saved');
          return new SchemString(`Successfully saved ${qualifiedFileName}.`);
        }).catch(e => e);
      return result;
    }
  };

  let interpreter = new Schem();
  interpreter.replEnv.addMap(messagingWithEventPage);
  interpreter.replEnv.addMap(editorManipulation);
  let ast: SchemType;
  AddSchemSupportToEditor(interpreter);

  let editor = monaco.editor.create(document.getElementById('monacoContainer')!, {
    value: example,
    language: 'schem',
    theme: 'vs-dark'
  });

  window.addEventListener('resize', () => { updateEditorLayout(editor); });
  updateEditorLayout(editor);
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

  let myKeyBinding = editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KEY_E, function() {

    editor.changeViewZones(function(changeAccessor) {
      let collectionRanges = getRangesOfSchemCollectionsAroundCursor();
      let sourceOfInnermostCollection = editor.getModel().getValueInRange(collectionRanges[collectionRanges.length - 1]);
      const viewZoneAfterLineNumber =  collectionRanges[1].endLineNumber; // collectionRanges[0] contains the '(do ...)' form, so we use the one a level below that

      addEvaluationViewZone(viewZoneAfterLineNumber, '...evaluating...', 'evalWaitingForResultViewZone');

      interpreter.arep(sourceOfInnermostCollection, messagingWithEventPage).then((result) => {
        addEvaluationViewZone(viewZoneAfterLineNumber, schemUnescape(result), 'evalResultViewZone');
      }).catch(error => {
        console.error(error);
        const errorMessage = (typeof error === 'string') ? error : error.message; // I still throw many plain strings as errors. This band-aid 'fixes' that.
        addEvaluationViewZone(viewZoneAfterLineNumber, errorMessage, 'evalErrorViewZone');
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

function updateEditorLayout(editor: monaco.editor.IStandaloneCodeEditor) {
  getHTMLElementById('monacoContainer').style.height = `${window.innerHeight}px`;
  getHTMLElementById('monacoContainer').style.width = `${window.innerWidth}px`;
  editor.layout();
}