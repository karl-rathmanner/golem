import * as monaco from 'monaco-editor';
import * as parinfer from './monaco/parinfer';
import { eventPageMessagingSchemFunctions, EventPageMessage } from './eventPageMessaging';
import { AddSchemSupportToEditor, SetInterpreterForCompletion } from './monaco/schemLanguage';
import { readStr, unescape as schemUnescape } from './schem/reader';
import { filterRecursively, Schem } from './schem/schem';
import { AnySchemType, SchemBoolean, SchemList, SchemNil, SchemString } from './schem/types';
import { extractErrorMessage } from './utils/utilities';
import { VirtualFileSystem } from './virtualFilesystem';
import { Settings } from './Settings';
import { browser } from 'webextension-polyfill-ts';

/** Uses the Monaco editor to provide a very integrated Schem development environment. */
export class SchemEditor {
  public monacoEditor: monaco.editor.IStandaloneCodeEditor;
  public openFileName: string;
  private evalZoneId: number;
  private ast: AnySchemType;
  private interpreter: Schem;

  constructor (private containerElement: HTMLElement, private options: {mode?: 'Schem' | 'JSON' | 'Text', interpreter?: Schem, expandContainer: boolean} = {mode: 'Schem', expandContainer: true}) {

    if (options.interpreter == null) {
      this.interpreter = new Schem();
      this.interpreter.replEnv.addMap(eventPageMessagingSchemFunctions);
      this.interpreter.replEnv.addMap(this.editorManipulationSchemFunctions);
      this.interpreter.loadCore();
    } else {
      this.interpreter = options.interpreter;
    }

    this.addSchemSupport();

    switch (options.mode) {
      case 'Schem': 
        this.enableSchemMode();
        break;
      case 'JSON': 
        this.enableJsonMode();
        break;
      default:
        this.enableTextMode;
    }

    this.addCustomActionsToCommandPalette();

    window.addEventListener('resize', this.updateEditorLayout);
    this.updateEditorLayout();
    this.monacoEditor.focus();
  }

  private addSchemSupport() {
    window.golem = {
      contextId: 0,
      features: ['schem-interpreter'],
      interpreter: this.interpreter
    };

    AddSchemSupportToEditor(this.interpreter);

    this.monacoEditor = monaco.editor.create(this.containerElement, {
      language: 'schem',
      theme: 'vs-dark'
    });

    this.addFormEvaluationCommand(this.interpreter);
    this.addParinfer();
  }

  public enableSchemMode() {
    monaco.editor.setModelLanguage(this.monacoEditor.getModel(), 'schem');
    this.monacoEditor.createContextKey('evalEnabled', true);
    this.monacoEditor.createContextKey('parinferEnabled', true);
  }

  private disableSchemMode() {
    this.monacoEditor.createContextKey('evalEnabled', false);
    this.monacoEditor.createContextKey('parinferEnabled', false);
  }

  public enableJsonMode() {
    this.disableSchemMode();
    monaco.editor.setModelLanguage(this.monacoEditor.getModel(), "json");
  }

  public enableTextMode() {
    this.disableSchemMode();
    monaco.editor.setModelLanguage(this.monacoEditor.getModel(), "");
  }

  public editorManipulationSchemFunctions = {
    'editor-load-script': async (qualifiedFileName: SchemString) => {
      this.loadLocalFile(qualifiedFileName.valueOf());
      return SchemBoolean.true;
    },
    'editor-save-script': async (qualifiedFileName: SchemString) => {
      this.saveScriptLocally(qualifiedFileName.valueOf());
      return new SchemString(`Successfully saved ${qualifiedFileName}.`);
    },
    'editor-update-layout': () => {
      this.updateEditorLayout();
      return SchemNil.instance;
    }
  };

  /** Add command shortcuts. */
  private addFormEvaluationCommand(interpreter: Schem) {
    this.monacoEditor.createContextKey('evalEnabled', true);
    this.monacoEditor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KEY_E, this.evaluateEditorContents(interpreter, 'bracketsSurroundingCursor'), 'evalEnabled');
    this.monacoEditor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KEY_E, this.evaluateEditorContents(interpreter, 'topLevelBracketsSurroundingCursor'), 'evalEnabled');
    this.monacoEditor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_E, this.evaluateEditorContents(interpreter, 'wholeBuffer'), 'evalEnabled');
  }

  /** Parinfer is a library that automatically creates all those pesky parens for you. */
  private addParinfer() {
    // Gist: When a (probably) user generated change to the model is detected, wait 700ms before running parinfer.
    // Parinfer returns the whole buffer and unless I integrate its smart mode or find a way to only edit the parts of the model that include changes,
    // each parinfer update will cause the editor to flash while the syntax highlighting is recalculated.
    // The current integration includes a bunch of work-arounds that I'm not proud of, but it's still way better than not having parinfer.
    // (The delay is currently 'necessary', for instance, because the rule relaxation around the cursor position doesn't seem to work ...always.)
    // TODO: find a proper fix for this workaround.

    this.monacoEditor.createContextKey('parinferEnabled', true);

    let timeoutID = 0;
    const startParinferCountdown = (callback: Function) => {
      // Remove the old timeout and start a new one if changes occur within 700ms of each other
      window.clearTimeout(timeoutID);
      timeoutID = window.setTimeout(() => {
        callback.call(this);
      }, 1400);
    };

    this.monacoEditor.onDidChangeModelContent(() => {
        startParinferCountdown(this.runParinfer);
    });
  }

  private runParinfer() {
    const source = this.monacoEditor.getModel().getValue();
    const cursorPosition = this.monacoEditor.getPosition();

    const parinferResult = parinfer.indentMode(source, {cursorLine: cursorPosition.lineNumber, cursorX: cursorPosition.column});

    // Only update the editor if parinfer changed anything, to reduce flashing and cursor shenannigans.
    if (parinferResult.text !== source) {
      this.monacoEditor.setValue(parinferResult.text);

      // Band-aid "fix" for the cursor occasionally jumping left of the last entered character.
      // TODO: investigate root cause
      if (cursorPosition.column > parinferResult.cursorX) parinferResult.cursorX = cursorPosition.column;
      this.monacoEditor.setPosition({lineNumber: parinferResult.cursorLine, column: parinferResult.cursorX});
    } else if (parinferResult.error != null) {
      // highlight the first offending character
      this.addTemporaryDecoration(new monaco.Range(parinferResult.error.lineNo + 1, parinferResult.error.x + 1, parinferResult.error.lineNo + 1, parinferResult.error.x + 2), 'sourceErrorDecoration');
      // display the error below the first offending line
      this.addEvaluationViewZone(parinferResult.error.lineNo + 1, `Parinfer Error: ${parinferResult.error.message}`, 'evalErrorViewZone');
    }
  }

  /** Evaluates some or all of the editor contents and shows the result right below that. */
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
              return bracketRanges[bracketRanges.length - 1];
            }
            default: return this.monacoEditor.getModel().getFullModelRange();
          }
        })();

        let schemCode = this.monacoEditor.getModel().getValueInRange(evaluationRange);

        // When evaluating the whole buffer, wrap it in a 'do' form
        if (mode === 'wholeBuffer') schemCode = `(do ${schemCode})`;

        const viewZoneAfterLineNumber = evaluationRange.endLineNumber;
        this.addEvaluationViewZone(viewZoneAfterLineNumber, '...evaluating...', 'evalWaitingForResultViewZone');
        
        // TODO: clean up
        this.interpreter.arep(schemCode).then((result) => {
          this.addEvaluationViewZone(viewZoneAfterLineNumber, schemUnescape(result), 'evalResultViewZone');
        }).catch(error => {
          console.error(error);
          this.addEvaluationViewZone(viewZoneAfterLineNumber, extractErrorMessage(error), 'evalErrorViewZone');
        });
        this.addTemporaryDecoration(evaluationRange, 'evaluatedSourceDecoration');
      });
    };
  }

  /** Adds commands to that list you see when you press [F1] */
  private addCustomActionsToCommandPalette() {
    this.monacoEditor.addAction({
      id: 'saveFileToVFS',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S],
      label: 'Save file to virtual file system',
      run: () => {
        const qualifiedFileName = prompt('Save at path/filename:', this.openFileName);
        if (qualifiedFileName != null && qualifiedFileName.length > 0) {
          this.saveScriptLocally(qualifiedFileName);
        }
      }
    });

    this.monacoEditor.addAction({
      id: 'loadFileFromVFS',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_O],
      label: 'Load file from virtual file system',
      run: () => {
        const qualifiedFileName = prompt('Load path/filename:', this.openFileName);
        if (qualifiedFileName != null && qualifiedFileName.length > 0) {
          this.loadLocalFile(qualifiedFileName);
        }
      }
    });

    this.monacoEditor.addAction({
      id: 'disableSchemFeatures',
      label: 'Disable Schem features',
      run: () => {
        this.disableSchemMode();
      }
    });

    this.monacoEditor.addAction({
      id: 'enableSchemFeatures',
      label: 'Enable Schem features',
      run: () => {
        this.enableSchemMode();
      }
    });

    this.monacoEditor.addAction({
      id: 'disableParinfer',
      label: 'Disable Parinfer',
      run: () => {
        this.monacoEditor.createContextKey('parinferEnabled', false);
      }
    });
    
    this.monacoEditor.addAction({
      id: 'enableParinfer',
      label: 'Enable Parinfer',
      run: () => {
        this.monacoEditor.createContextKey('parinferEnabled', true);
      }
    });
  
  }

  /** Shows the results of live evaluations. (Or error messages thereof.) */
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

  private addTemporaryDecoration(decorationRange: monaco.IRange, className: 'evaluatedSourceDecoration' | 'sourceErrorDecoration') {
    let tmpDecoration = Array<string>();
    // remove evalViews and decorations when buffer changes
    this.monacoEditor.getModel().onDidChangeContent((e) => {
      tmpDecoration = this.monacoEditor.deltaDecorations(tmpDecoration, []);
      this.monacoEditor.changeViewZones((changeAccessor) => {
        changeAccessor.removeZone(this.evalZoneId);
      });
    });
    // highlight evaluated source range
    tmpDecoration = this.monacoEditor.deltaDecorations(tmpDecoration, [
      { range: decorationRange, options: { inlineClassName: className } }
    ]);
  }

  /** Creates that little arrow when evaluation results are displayed. You know, where the line numbers would be if the arrow wasn't there...*/
  private createEvalMarginDomNode(): HTMLDivElement {
    let marginDomNode = document.createElement('div');
    marginDomNode.classList.add('line-numbers');
    marginDomNode.classList.add('evalMarginViewZone');
    marginDomNode.textContent = '→';
    return marginDomNode;
  }

  /** Parses the editor content. */
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

  /** Updates the editor layout, useful when the window size changes. */
  private updateEditorLayout = () => {
    if (this.options.expandContainer === true) {
      this.containerElement.style.height = `${window.innerHeight}px`;
      this.containerElement.style.width = `${window.innerWidth}px`;
    }
    this.monacoEditor.layout();
  }

  /** Opens a script from the virtual file system or from other, more special places. */
  public async loadLocalFile(qualifiedFileName: string): Promise<void> {

    // Handle magic filenames (these are not part of the virtual file system and may cause special behaviour)
    switch (qualifiedFileName) {
      case '.golemrc':
        this.openFileName = '.golemrc';
        this.switchToEventPageInterpreter();
        this.loadRunCommands();
        return;
      case 'examples.schem':
        const examples = require('!raw-loader!./schemScripts/example.schem');
        this.monacoEditor.setValue(examples);
        return;
    }

    // Handle regular filenames
    let fileExists = await VirtualFileSystem.existsOject(qualifiedFileName);
    if (!fileExists) {
      window.alert('File not found.');
      return;
    }

    let candidate = await VirtualFileSystem.readObject(qualifiedFileName);

    if (typeof candidate === 'string') {
      this.openFileName = qualifiedFileName;
      window.location.hash = qualifiedFileName;
      this.monacoEditor.setValue(candidate);

      if (/\.schem$/.test(qualifiedFileName)) {
        this.enableSchemMode();
      } else if (/\.json$/.test(qualifiedFileName)) {
        this.enableJsonMode();
      } else {
        this.enableTextMode();
      }
    } else {
      window.alert(`The editor currently can't open non-string objects.`);
      throw new Error(`Can only load strings into the editor, encountered something else saved under: ${qualifiedFileName}`);
    }
  }

  public async saveScriptLocally(qualifiedFileName: string): Promise<void> {
    if (this.openFileName === '.golemrc') {
      this.saveAsRunCommands();
      return;
    }

    const script = this.monacoEditor.getValue();
    let mayOverwrite = true;
    if (await VirtualFileSystem.existsOject(qualifiedFileName)) {
      mayOverwrite = window.confirm('File exists. Do you want to overwrite it?');
    }

    if (mayOverwrite) {
      await VirtualFileSystem.writeObject(qualifiedFileName, script, true).then(() => {
        this.openFileName = qualifiedFileName;
        window.location.hash = qualifiedFileName;
        return;
      }).catch(e => e);
    }
  }

  /** Enables schem interpretation and completion in the event page context. Needed for editing the .rc-file. */
  private async switchToEventPageInterpreter() {
    const bgp = await browser.runtime.getBackgroundPage();
    this.interpreter = bgp.golem.priviledgedContext!.globalState.eventPageInterpreter;
    SetInterpreterForCompletion(this.interpreter);
  }

  /** Loads the .golemrc script from local storage. */
  public async loadRunCommands(): Promise<void> {
    window.location.hash = this.openFileName = '.golemrc';
    
    let settings = await Settings.loadSettings();
    if (settings.runCommands.length > 0) {
      this.monacoEditor.setValue(settings.runCommands);
    }
  }

  /** Saves the .golemrc script to local storage. */
  public async saveAsRunCommands(): Promise<void> {
      const editorContents = this.monacoEditor.getValue();
      await Settings.saveSettings({runCommands: editorContents});

      if (window.confirm('New run commands will be executed now. (Click "cancel" to save without running them.)')) {
        let msg: EventPageMessage = {action: 'execute-run-commands'}
        chrome.runtime.sendMessage(msg);
      };
  }
}