import * as monaco from 'monaco-editor';
import { AddSchemSupportToEditor } from './monaco/schemLanguage';
import { Schem, filterRecursively } from './schem/schem';
import { readStr } from './schem/reader';
import { SchemType, SchemVector, SchemList } from './schem/types';
const example = require('!raw-loader!./schemScripts/example.schem');

window.onload = () => {
  let interpreter = new Schem();
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
      changeAccessor.removeZone(evalZone);
    });
  });

  editor.createContextKey('evalEnabled', true);
  let evalZone: number;
  let evalDecoration = Array<string>();

  let myBinding = editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KEY_E, function() {

    editor.changeViewZones(function(changeAccessor) {

        let collectionRanges = getRangesOfSchemCollectionsAroundCursor();
        let sourceOfInnermostCollection = editor.getModel().getValueInRange(collectionRanges[collectionRanges.length - 1]);

        let resultDomNode = document.createElement('div');
        resultDomNode.classList.add('view-lines');
        resultDomNode.className = 'evalResultViewZone';
        resultDomNode.textContent = '...evaluating...';

        interpreter.arep(sourceOfInnermostCollection).then((result) => {
          resultDomNode.textContent = result;
        }).catch(error => {
          resultDomNode.className = 'evalErrorViewZone';
          resultDomNode.textContent = error;
        });


        let marginDomNode = document.createElement('div');
        marginDomNode.classList.add('line-numbers');
        marginDomNode.classList.add('evalMarginViewZone');
        marginDomNode.textContent = '=>';

        // remove old result zone
        changeAccessor.removeZone(evalZone);
        // add new one
        evalZone = changeAccessor.addZone({
              afterLineNumber: collectionRanges[1].endLineNumber, // collectionRanges[0] contains the '(do ...)' form, so we use the one a level below that
              heightInLines: 1,
              domNode: resultDomNode,
              marginDomNode: marginDomNode,
        });

        // highlight evaluated source range
        evalDecoration = editor.deltaDecorations(evalDecoration, [
          { range: collectionRanges[collectionRanges.length - 1], options: { inlineClassName: 'evaluatedSourceDecoration' }}
        ]);



    });
  }, 'evalEnabled');

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
        console.log(element);

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

