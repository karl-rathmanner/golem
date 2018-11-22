import * as monaco from 'monaco-editor';
import { eventPageMessagingSchemFunctions } from './eventPageMessaging';
import { AddSchemSupportToEditor } from './monaco/schemLanguage';
import { readStr, unescape as schemUnescape } from './schem/reader';
import { filterRecursively, Schem } from './schem/schem';
import { SchemList, AnySchemType, SchemString, SchemBoolean } from './schem/types';
import { getHTMLElementById } from './utils/domManipulation';
import { VirtualFileSystem } from './virtualFilesystem';
import { extractErrorMessage } from './utils/utilities';
import { shlukerts } from './shlukerts';

const example = require('!raw-loader!./schemScripts/example.schem');

export class SchemEditor {
  public monacoEditor: monaco.editor.IStandaloneCodeEditor;
  private evalZoneId: number;
  private ast: AnySchemType;

  constructor (container: HTMLElement) {
    const interpreter = new Schem();
    interpreter.replEnv.addMap(eventPageMessagingSchemFunctions);
    interpreter.replEnv.addMap(this.editorManipulationSchemFunctions);
    interpreter.replEnv.addMap(shlukerts);

    AddSchemSupportToEditor(interpreter);

    this.monacoEditor = monaco.editor.create(container, {
      value: example,
      language: 'schem',
      theme: 'vs-dark'

    });
    window.addEventListener('resize', this.updateEditorLayout);
    this.updateEditorLayout();
    this.monacoEditor.focus();

    this.addFormEvaluationCommand(interpreter);
  }

  private editorManipulationSchemFunctions = {
    'editor-load-script': async (qualifiedFileName: SchemString) => {
      this.loadLocalScript(qualifiedFileName.valueOf());
      return SchemBoolean.true;
    },
    'editor-save-script': async (qualifiedFileName: SchemString) => {
      this.saveScriptLocally(qualifiedFileName.valueOf());
      return new SchemString(`Successfully saved ${qualifiedFileName}.`);
    }
  };

  private addFormEvaluationCommand(interpreter: Schem) {
    this.monacoEditor.createContextKey('evalEnabled', true);

    this.monacoEditor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KEY_E, () => {
      this.monacoEditor.changeViewZones((changeAccessor: any) => {
        let collectionRanges = this.getRangesOfSchemCollectionsAroundCursor();
        let sourceOfInnermostCollection = this.monacoEditor.getModel().getValueInRange(collectionRanges[collectionRanges.length - 1]);
        const viewZoneAfterLineNumber = collectionRanges[1].endLineNumber; // collectionRanges[0] contains the '(do ...)' form, so we use the one a level below that
        this.addEvaluationViewZone(viewZoneAfterLineNumber, '...evaluating...', 'evalWaitingForResultViewZone');
        interpreter.arep(sourceOfInnermostCollection).then((result) => {
          this.addEvaluationViewZone(viewZoneAfterLineNumber, schemUnescape(result), 'evalResultViewZone');
        }).catch(error => {
          console.error(error);
          this.addEvaluationViewZone(viewZoneAfterLineNumber, extractErrorMessage(error), 'evalErrorViewZone');
        });
        // handle decoration stuff
        let evalDecoration = Array<string>();
        // remove evalViews and decorations when buffer changes
        this.monacoEditor.getModel().onDidChangeContent((e) => {
          evalDecoration = this.monacoEditor.deltaDecorations(evalDecoration, []);
          this.monacoEditor.changeViewZones((changeAccessor) => {
            changeAccessor.removeZone(this.evalZoneId);
          });
        });
        // highlight evaluated source range
        evalDecoration = this.monacoEditor.deltaDecorations(evalDecoration, [
          { range: collectionRanges[collectionRanges.length - 1], options: { inlineClassName: 'evaluatedSourceDecoration' } }
        ]);
      });
    }, 'evalEnabled');
  }

  private addEvaluationViewZone(afterLineNumber: number, content: string, className: string): void {
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

    let marginDomNode = this.createEvalMarginDomNode();

    this.monacoEditor.changeViewZones((changeAccessor) => {
      changeAccessor.removeZone(this.evalZoneId);

      this.evalZoneId = changeAccessor.addZone({
        afterLineNumber: afterLineNumber,
        heightInLines: Math.min(lines.length, 3),
        domNode: domNode,
        marginDomNode: marginDomNode,
      });
    });
  }

  private createEvalMarginDomNode(): HTMLDivElement {
    let marginDomNode = document.createElement('div');
    marginDomNode.classList.add('line-numbers');
    marginDomNode.classList.add('evalMarginViewZone');
    marginDomNode.textContent = '=>';
    return marginDomNode;
  }

  private updateAst() {
    try {
      // wrap source with a 'do' form so every list gets read
      this.ast = readStr('(do ' + this.monacoEditor.getModel().getValue() + ')', true);
    } catch (e) {
      console.log(e);
    }
  }

  private getRangesOfSchemCollectionsAroundCursor(): monaco.Range[] {
    const textModel = this.monacoEditor.getModel();
    this.updateAst();
    // offset cursorIndex by four to compensate for the 'do' form
    const cursorIndex = textModel.getOffsetAt(this.monacoEditor.getPosition()) + 4;

    // I'm sorry...
    const collectionsAroundCursor = filterRecursively(this.ast, (element) => {
      if (element != null && 'metadata' in element && element.metadata !== undefined &&
      'sourceIndexStart' in element.metadata && typeof element.metadata.sourceIndexStart === 'number' &&
      'sourceIndexEnd' in element.metadata && typeof element.metadata.sourceIndexEnd === 'number') {
        return (element.metadata.sourceIndexStart < cursorIndex + 1 && element.metadata.sourceIndexEnd > cursorIndex - 1);
      } else {
        return false;
      }
    });

    return collectionsAroundCursor.map(element => {
      let metadata = (element as SchemList).metadata!;

      // offset positions to compensate for the 'do' form (and make endPos include the last character)
      let startPos = textModel.getPositionAt(metadata.sourceIndexStart! - 4);
      let endPos = textModel.getPositionAt(metadata.sourceIndexEnd! - 3);

      return new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column);
    });
  }

  private updateEditorLayout = () => {
    getHTMLElementById('monacoContainer').style.height = `${window.innerHeight}px`;
    getHTMLElementById('monacoContainer').style.width = `${window.innerWidth}px`;
    this.monacoEditor.layout();
  }

  public async loadLocalScript(qualifiedFileName: string): Promise<void> {
    let candidate = await VirtualFileSystem.readObject(qualifiedFileName);
    if (typeof candidate === 'string') {
      this.monacoEditor.setValue(candidate);
    } else {
      throw new Error(`Can only load strings into the editor, encountered something else saved under: ${qualifiedFileName}`);
    }
  }

  public async saveScriptLocally(qualifiedFileName: string): Promise<void> {
    const script = this.monacoEditor.getValue();
      const result =  await VirtualFileSystem.writeObject(qualifiedFileName, script, true)
      .then(() => {
        return;
      }).catch(e => e);
  }
}