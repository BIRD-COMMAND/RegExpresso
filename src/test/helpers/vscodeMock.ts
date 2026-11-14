import Module = require('node:module');

export class MockPosition {
  constructor(
    public readonly line: number,
    public readonly character: number
  ) {}

  isEqual(other: MockPosition): boolean {
    return this.line === other.line && this.character === other.character;
  }
}

export class MockRange {
  public readonly start: MockPosition;
  public readonly end: MockPosition;

  constructor(
    startOrStartLine: MockPosition | number,
    endOrStartChar: MockPosition | number,
    endLine?: number,
    endChar?: number
  ) {
    if (typeof startOrStartLine === 'number' && typeof endOrStartChar === 'number') {
      this.start = new MockPosition(startOrStartLine, endOrStartChar);
      this.end = new MockPosition(endLine ?? startOrStartLine, endChar ?? endOrStartChar);
    } else {
      this.start = startOrStartLine as MockPosition;
      this.end = endOrStartChar as MockPosition;
    }
  }

  get isEmpty(): boolean {
    return this.start.isEqual(this.end);
  }
}

export class MockSelection extends MockRange {
  public readonly anchor: MockPosition;
  public readonly active: MockPosition;

  constructor(anchor: MockPosition, active: MockPosition) {
    super(anchor, active);
    this.anchor = anchor;
    this.active = active;
  }
}

export class MockThemeColor {
  constructor(public readonly id: string) {}
}

export class MockThemeIcon {
  constructor(public readonly id: string) {}
}

/**
 * UTF-16 code-unit and LF/CRLF accurate mock of `vscode.TextDocument`.
 */
export class MockTextDocument {
  private _text: string;
  private _lineOffsets: number[] = [];
  public readonly uri: { toString: () => string };
  public readonly languageId: string;

  constructor(text: string, uriStr = 'untitled:MockDoc-1', languageId = 'typescript') {
    this._text = text;
    this.uri = { toString: () => uriStr };
    this.languageId = languageId;
    this._recomputeLineOffsets();
  }

  private _recomputeLineOffsets(): void {
    this._lineOffsets = [0];
    for (let i = 0; i < this._text.length; i++) {
      if (this._text[i] === '\n') {
        this._lineOffsets.push(i + 1);
      }
    }
  }

  get lineCount(): number {
    return this._lineOffsets.length;
  }

  getText(range?: MockRange): string {
    if (!range) {
      return this._text;
    }
    const startOffset = this.offsetAt(range.start);
    const endOffset = this.offsetAt(range.end);
    return this._text.slice(startOffset, endOffset);
  }

  setText(newText: string): void {
    this._text = newText;
    this._recomputeLineOffsets();
  }

  /**
   * Converts a zero-based UTF-16 code-unit offset to a (line, character) Position.
   */
  positionAt(offset: number): MockPosition {
    const clamped = Math.max(0, Math.min(offset, this._text.length));
    let low = 0;
    let high = this._lineOffsets.length - 1;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const lineStart = this._lineOffsets[mid];
      const nextLineStart =
        mid + 1 < this._lineOffsets.length ? this._lineOffsets[mid + 1] : this._text.length + 1;

      if (clamped < lineStart) {
        high = mid - 1;
      } else if (clamped >= nextLineStart) {
        low = mid + 1;
      } else {
        return new MockPosition(mid, clamped - lineStart);
      }
    }

    const lastLine = this._lineOffsets.length - 1;
    return new MockPosition(lastLine, clamped - this._lineOffsets[lastLine]);
  }

  /**
   * Converts a (line, character) Position to a zero-based UTF-16 code-unit offset.
   */
  offsetAt(position: MockPosition): number {
    if (position.line < 0) return 0;
    if (position.line >= this._lineOffsets.length) return this._text.length;
    const lineOffset = this._lineOffsets[position.line];
    return Math.min(this._text.length, lineOffset + Math.max(0, position.character));
  }
}

export class MockTextEditor {
  public selections: MockSelection[] = [
    new MockSelection(new MockPosition(0, 0), new MockPosition(0, 0))
  ];
  public revealedRanges: MockRange[] = [];
  public decorations = new Map<unknown, unknown[]>();

  constructor(public readonly document: MockTextDocument) {}

  get selection(): MockSelection {
    return this.selections[0];
  }

  set selection(sel: MockSelection) {
    this.selections = [sel];
  }

  revealRange(range: MockRange): void {
    this.revealedRanges.push(range);
  }

  setDecorations(decorationType: unknown, rangesOrOptions: unknown[]): void {
    this.decorations.set(decorationType, rangesOrOptions);
  }

  async edit(
    callback: (editBuilder: {
      replace: (range: MockRange, newText: string) => void;
      insert: (pos: MockPosition, newText: string) => void;
      delete: (range: MockRange) => void;
    }) => void
  ): Promise<boolean> {
    const edits: { startOffset: number; endOffset: number; newText: string }[] = [];

    const editBuilder = {
      replace: (range: MockRange, newText: string) => {
        edits.push({
          startOffset: this.document.offsetAt(range.start),
          endOffset: this.document.offsetAt(range.end),
          newText
        });
      },
      insert: (pos: MockPosition, newText: string) => {
        const offset = this.document.offsetAt(pos);
        edits.push({ startOffset: offset, endOffset: offset, newText });
      },
      delete: (range: MockRange) => {
        edits.push({
          startOffset: this.document.offsetAt(range.start),
          endOffset: this.document.offsetAt(range.end),
          newText: ''
        });
      }
    };

    callback(editBuilder);

    // Apply edits from back to front so earlier offsets stay valid
    edits.sort((a, b) => b.startOffset - a.startOffset);
    let current = this.document.getText();
    for (const e of edits) {
      current = current.slice(0, e.startOffset) + e.newText + current.slice(e.endOffset);
    }
    this.document.setText(current);
    return true;
  }
}

export class MockQuickPick<T = unknown> {
  public title = '';
  public placeholder = '';
  public value = '';
  public items: T[] = [];
  public activeItems: T[] = [];
  public selectedItems: T[] = [];
  public buttons: unknown[] = [];
  public matchOnDescription = false;
  public matchOnDetail = false;
  public ignoreFocusOut = false;
  public visible = false;
  public disposed = false;

  private _changeValueListeners: ((val: string) => void)[] = [];
  private _acceptListeners: (() => Promise<void> | void)[] = [];
  private _hideListeners: (() => void)[] = [];
  private _buttonListeners: ((btn: unknown) => void)[] = [];

  onDidChangeValue(listener: (val: string) => void) {
    this._changeValueListeners.push(listener);
    return { dispose: () => {} };
  }

  onDidAccept(listener: () => Promise<void> | void) {
    this._acceptListeners.push(listener);
    return { dispose: () => {} };
  }

  onDidHide(listener: () => void) {
    this._hideListeners.push(listener);
    return { dispose: () => {} };
  }

  onDidTriggerButton(listener: (btn: unknown) => void) {
    this._buttonListeners.push(listener);
    return { dispose: () => {} };
  }

  show(): void {
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
    for (const l of this._hideListeners) {
      l();
    }
  }

  dispose(): void {
    this.disposed = true;
  }

  // Test helper methods
  typeText(newValue: string): void {
    this.value = newValue;
    for (const l of this._changeValueListeners) {
      l(newValue);
    }
  }

  async accept(): Promise<void> {
    for (const l of this._acceptListeners) {
      await l();
    }
  }

  triggerButton(btn: unknown): void {
    for (const l of this._buttonListeners) {
      l(btn);
    }
  }
}

export interface VscodeMockHostState {
  activeTextEditor: MockTextEditor | undefined;
  clipboardText: string;
  statusBarMessages: string[];
  warningMessages: string[];
  infoMessages: string[];
  executedCommands: { command: string; args: unknown[] }[];
  registeredCommands: Map<string, (...args: unknown[]) => unknown>;
  createdQuickPicks: MockQuickPick[];
  openedDocuments: MockTextDocument[];
  shownDocuments: { doc: MockTextDocument; column: unknown }[];
  activeEditorChangeListeners: ((editor: MockTextEditor | undefined) => void)[];
  closeDocListeners: ((doc: MockTextDocument) => void)[];
  reset: () => void;
  fireDidChangeActiveTextEditor: (editor: MockTextEditor | undefined) => void;
  fireDidCloseTextDocument: (doc: MockTextDocument) => void;
}

export const vscodeHostState: VscodeMockHostState = {
  activeTextEditor: undefined,
  clipboardText: '',
  statusBarMessages: [],
  warningMessages: [],
  infoMessages: [],
  executedCommands: [],
  registeredCommands: new Map(),
  createdQuickPicks: [],
  openedDocuments: [],
  shownDocuments: [],
  activeEditorChangeListeners: [],
  closeDocListeners: [],
  reset() {
    this.activeTextEditor = undefined;
    this.clipboardText = '';
    this.statusBarMessages = [];
    this.warningMessages = [];
    this.infoMessages = [];
    this.executedCommands = [];
    this.registeredCommands.clear();
    this.createdQuickPicks = [];
    this.openedDocuments = [];
    this.shownDocuments = [];
    this.activeEditorChangeListeners = [];
    this.closeDocListeners = [];
  },
  fireDidChangeActiveTextEditor(editor: MockTextEditor | undefined) {
    this.activeTextEditor = editor;
    for (const listener of this.activeEditorChangeListeners) {
      listener(editor);
    }
  },
  fireDidCloseTextDocument(doc: MockTextDocument) {
    for (const listener of this.closeDocListeners) {
      listener(doc);
    }
  }
};

const vscodeMockModule = {
  Position: MockPosition,
  Range: MockRange,
  Selection: MockSelection,
  ThemeColor: MockThemeColor,
  ThemeIcon: MockThemeIcon,
  DecorationRangeBehavior: {
    ClosedClosed: 1
  },
  ViewColumn: {
    Beside: 2
  },
  window: {
    get activeTextEditor() {
      return vscodeHostState.activeTextEditor;
    },
    set activeTextEditor(editor: MockTextEditor | undefined) {
      vscodeHostState.activeTextEditor = editor;
    },
    setStatusBarMessage(msg: string) {
      vscodeHostState.statusBarMessages.push(msg);
      return { dispose: () => {} };
    },
    showWarningMessage(msg: string) {
      vscodeHostState.warningMessages.push(msg);
      return Promise.resolve(undefined);
    },
    showInformationMessage(msg: string) {
      vscodeHostState.infoMessages.push(msg);
      return Promise.resolve(undefined);
    },
    createTextEditorDecorationType(options: unknown) {
      return { options, dispose: () => {} };
    },
    createQuickPick<T>() {
      const qp = new MockQuickPick<T>();
      vscodeHostState.createdQuickPicks.push(qp as unknown as MockQuickPick);
      return qp;
    },
    async showTextDocument(doc: MockTextDocument, column?: unknown) {
      vscodeHostState.shownDocuments.push({ doc, column });
      const editor = new MockTextEditor(doc);
      return editor;
    },
    onDidChangeActiveTextEditor(listener: (editor: MockTextEditor | undefined) => void) {
      vscodeHostState.activeEditorChangeListeners.push(listener);
      return { dispose: () => {} };
    }
  },
  commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown) {
      vscodeHostState.registeredCommands.set(command, callback);
      return {
        dispose: () => {
          vscodeHostState.registeredCommands.delete(command);
        }
      };
    },
    async executeCommand(command: string, ...args: unknown[]) {
      vscodeHostState.executedCommands.push({ command, args });
      // Built-in editor.action.sortLinesAscending simulation for `sort-then-regex` workarounds
      if (command === 'editor.action.sortLinesAscending' && vscodeHostState.activeTextEditor) {
        const doc = vscodeHostState.activeTextEditor.document;
        const text = doc.getText();
        const eol = text.includes('\r\n') ? '\r\n' : '\n';
        const sorted = text.split(/\r?\n/).sort().join(eol);
        doc.setText(sorted);
        return undefined;
      }
      const handler = vscodeHostState.registeredCommands.get(command);
      if (handler) {
        return await handler(...args);
      }
      return undefined;
    }
  },
  workspace: {
    async openTextDocument(options: { content?: string; language?: string }) {
      const doc = new MockTextDocument(
        options.content ?? '',
        `untitled:Extracted-${vscodeHostState.openedDocuments.length + 1}`,
        options.language ?? 'plaintext'
      );
      vscodeHostState.openedDocuments.push(doc);
      return doc;
    },
    onDidCloseTextDocument(listener: (doc: MockTextDocument) => void) {
      vscodeHostState.closeDocListeners.push(listener);
      return { dispose: () => {} };
    }
  },
  env: {
    clipboard: {
      async writeText(text: string) {
        vscodeHostState.clipboardText = text;
      },
      async readText() {
        return vscodeHostState.clipboardText;
      }
    }
  }
};

let isInstalled = false;

/**
 * Registers the `vscode` mock module into Node's CommonJS module loader so
 * `src/executor.ts` and `src/extension.ts` can be imported directly in Node.js.
 */
export function installVscodeMock(): typeof vscodeMockModule {
  if (!isInstalled) {
    const mod = Module as unknown as {
      _load: (request: string, parent: unknown, isMain: boolean) => unknown;
    };
    const originalLoad = mod._load;
    mod._load = function (request: string, parent: unknown, isMain: boolean) {
      if (request === 'vscode') {
        return vscodeMockModule;
      }
      return originalLoad.apply(this, [request, parent, isMain]);
    };
    isInstalled = true;
  }
  return vscodeMockModule;
}
