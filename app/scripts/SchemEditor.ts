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
  public openFileName: string;
  private evalZoneId: number;
  private ast: AnySchemType;

  constructor (private containerElement: HTMLElement, private options: {interpreter?: Schem, expandContainer: boolean} = {expandContainer: true}) {
    let interpreter: Schem;
    if (options.interpreter == null) {
      interpreter = new Schem();
      interpreter.replEnv.addMap(eventPageMessagingSchemFunctions);
      interpreter.replEnv.addMap(this.editorManipulationSchemFunctions);
    } else {
      interpreter = options.interpreter;
    }

    AddSchemSupportToEditor(interpreter);

    this.monacoEditor = monaco.editor.create(containerElement, {
      value: example,
      language: 'schem',
      theme: 'vs-dark'
    });

    window.addEventListener('resize', this.updateEditorLayout);
    this.updateEditorLayout();
    this.monacoEditor.focus();
    
    this.addCustomActionsToCommandPalette();
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
    this.monacoEditor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KEY_E, this.evaluateEditorContents(interpreter, 'bracketsSurroundingCursor'), 'evalEnabled');
    this.monacoEditor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KEY_E, this.evaluateEditorContents(interpreter, 'topLevelBracketsSurroundingCursor'), 'evalEnabled');
    this.monacoEditor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_E, this.evaluateEditorContents(interpreter, 'wholeBuffer'), 'evalEnabled');
  }

  private evaluateEditorContents(interpreter: Schem, mode: 'wholeBuffer' | 'bracketsSurroundingCursor' | 'topLevelBracketsSurroundingCursor'): monaco.editor.ICommandHandler {
    return () => {
      this.monacoEditor.changeViewZones((changeAccessor: any) => {

        const evaluationRange = (() => {
          switch (mode) {
            case 'topLevelBracketsSurroundingCursor': {
              const bracketRanges = this.getRangesOfBracketsSurroundingCursor();
              // brackteRages[0] contains the implicit '(do ...)' form, so we use the one a level below that
              return bracketRanges[1];
            }
            case 'bracketsSurroundingCursor':  {
              const bracketRanges = this.getRangesOfBracketsSurroundingCursor();
              return bracketRanges[bracketRanges.length -1];
            }
            default: return this.monacoEditor.getModel().getFullModelRange();
          }
        })();
        
        let schemCode = this.monacoEditor.getModel().getValueInRange(evaluationRange);

        // When evaluating the whole buffer, wrap it in a 'do' form
        if (mode === 'wholeBuffer') schemCode = `(do ${schemCode})`;

        const viewZoneAfterLineNumber = evaluationRange.endLineNumber; 
        this.addEvaluationViewZone(viewZoneAfterLineNumber, '...evaluating...', 'evalWaitingForResultViewZone');
        interpreter.arep(schemCode).then((result) => {
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
          { range: evaluationRange, options: { inlineClassName: 'evaluatedSourceDecoration' } }
        ]);
      });
    };
  }

  private addCustomActionsToCommandPalette() {
    this.monacoEditor.addAction({
      id: 'saveScriptToVFS',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S],
      label: 'Save script to virtual file system',
      run: () => {
        const qualifiedFileName = prompt('Save at path/filename:', this.openFileName);
        if (qualifiedFileName != null && qualifiedFileName.length > 0) {
          this.saveScriptLocally(qualifiedFileName);
        } 
      }
    });

    this.monacoEditor.addAction({
      id: 'loadScriptFromVFS',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_O],
      label: 'Load script from virtual file system',
      run: () => {
        const qualifiedFileName = prompt('Load path/filename:', this.openFileName);
        if (qualifiedFileName != null && qualifiedFileName.length > 0) {
          this.loadLocalScript(qualifiedFileName);
        }
      }
    });
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

  /** Returns an array of the nested ranges of brackets surrounding the cursor.
   * (This uses the reader to turn the buffer into an ast. Fails miserably when the file contains syntax errors.
   * TODO: give better feedback about missing brackets etc.
   * @returns Range[] where first element => whole buffer, last element => innermost brackets / innermost collection node in the ast
   * */
  private getRangesOfBracketsSurroundingCursor(): monaco.Range[] {
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
    if (this.options.expandContainer === true) {
      this.containerElement.style.height = `${window.innerHeight}px`;
      this.containerElement.style.width = `${window.innerWidth}px`;
    }
    this.monacoEditor.layout();
  }

  public async loadLocalScript(qualifiedFileName: string): Promise<void> {
    let candidate = await VirtualFileSystem.readObject(qualifiedFileName);
    if (typeof candidate === 'string') {
      this.openFileName = qualifiedFileName;
      this.monacoEditor.setValue(candidate);
    } else {
      throw new Error(`Can only load strings into the editor, encountered something else saved under: ${qualifiedFileName}`);
    }
  }

  public async saveScriptLocally(qualifiedFileName: string): Promise<void> {
    const script = this.monacoEditor.getValue();
    await VirtualFileSystem.writeObject(qualifiedFileName, script, true).then(() => {
      this.openFileName = qualifiedFileName;
      return;
    }).catch(e => e);
  }
}