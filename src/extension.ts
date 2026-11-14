import * as vscode from 'vscode';
import { parseNaturalLanguageRequest } from './compiler';
import {
  executeRegexAction,
  executeWorkaround,
  findAllMatchesInEditor,
  formatReplacementPreview
} from './executor';
import {
  CompiledRegexResult,
  ExecutionAction,
  ImpossibleRegexResult
} from './types';

export { formatReplacementPreview };

interface ActionQuickPickItem extends vscode.QuickPickItem {
  action: ExecutionAction;
  compiled?: CompiledRegexResult;
  impossible?: ImpossibleRegexResult;
}

interface TabUiState {
  isActive: boolean;
  queryText: string;
  historyIndex: number;
  draftQuery: string;
}

export function activate(context: vscode.ExtensionContext) {
  // Session-persistent query history for the lifetime of the running extension
  const queryHistory: string[] = [];

  // Per-tab persistent UI state keyed by document URI string
  const tabStates = new Map<string, TabUiState>();

  let activeQuickPick: vscode.QuickPick<ActionQuickPickItem> | undefined;
  let currentTrackedEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
  let navigateHistoryHandler: ((direction: 'prev' | 'next') => void) | undefined;
  let isProgrammaticValueUpdate = false;
  let isProgrammaticHide = false;
  let tabSwitchTimer: ReturnType<typeof setTimeout> | undefined;

  const getTabKey = (editor: vscode.TextEditor): string => editor.document.uri.toString();

  const getOrCreateTabState = (editor: vscode.TextEditor): TabUiState => {
    const key = getTabKey(editor);
    let state = tabStates.get(key);
    if (!state) {
      state = {
        isActive: false,
        queryText: '',
        historyIndex: queryHistory.length,
        draftQuery: ''
      };
      tabStates.set(key, state);
    }
    return state;
  };

  // Editor decorations for live match and replacement preview
  const matchHighlightDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    border: '1px solid',
    borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });

  const replacementPreviewDecoration = vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 6px',
      color: new vscode.ThemeColor('editorCodeLens.foreground'),
      fontStyle: 'italic'
    }
  });

  const clearDecorationsOnEditor = (editor: vscode.TextEditor | undefined) => {
    if (!editor) return;
    try {
      editor.setDecorations(matchHighlightDecoration, []);
      editor.setDecorations(replacementPreviewDecoration, []);
    } catch {
      // Editor may have been disposed
    }
  };

  const prevHistoryButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('arrow-up'),
    tooltip: 'Previous Query in History (Shift+Up)'
  };

  const nextHistoryButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('arrow-down'),
    tooltip: 'Next Query in History (Shift+Down)'
  };

  const evaluateAndRenderQuery = (
    value: string,
    editor: vscode.TextEditor | undefined,
    quickPick: vscode.QuickPick<ActionQuickPickItem> | undefined
  ) => {
    if (!editor || !quickPick) return;

    const trimmed = value.trim();
    if (!trimmed) {
      quickPick.items = [];
      clearDecorationsOnEditor(editor);
      return;
    }

    const outcome = parseNaturalLanguageRequest(trimmed);

    if (!outcome.isPossible) {
      clearDecorationsOnEditor(editor);
      const items: ActionQuickPickItem[] = [
        {
          label: `$(error) Impossible in Pure Regex: ${outcome.category}`,
          description: '',
          detail: `${outcome.reason} — Advice: ${outcome.advice}`,
          alwaysShow: true,
          action: 'open-in-native-find',
          impossible: outcome
        }
      ];

      if (outcome.workaround) {
        items.push({
          label: `$(wand) ${outcome.workaround.label}`,
          description: 'One-Click Workaround',
          detail: outcome.workaround.description,
          alwaysShow: true,
          action: 'run-workaround',
          impossible: outcome
        });
      }

      quickPick.items = items;
      if (items.length > 0) {
        quickPick.activeItems = [items[0]];
      }
      return;
    }

    // Valid compiled regex: compute live editor matches and decorations
    const primaryStep = outcome.steps[0];
    let matchCount = 0;

    try {
      const { fullRanges, previews } = findAllMatchesInEditor(editor, primaryStep);
      matchCount = fullRanges.length;

      editor.setDecorations(matchHighlightDecoration, fullRanges);

      if (primaryStep.replace !== undefined && previews.length > 0) {
        const previewOptions: vscode.DecorationOptions[] = previews.slice(0, 250).map((p) => ({
          range: p.range,
          renderOptions: {
            after: {
              contentText: `→ ${formatReplacementPreview(p.replacementText)}`
            }
          }
        }));
        editor.setDecorations(replacementPreviewDecoration, previewOptions);
      } else {
        editor.setDecorations(replacementPreviewDecoration, []);
      }
    } catch {
      clearDecorationsOnEditor(editor);
    }

    const stepBadge =
      outcome.steps.length > 1
        ? `[${outcome.steps.length}-Step Pipeline] ${outcome.steps.map((s) => `/${s.find}/ → "${s.replace ?? ''}"`).join('  ⇒  ')}`
        : `Find: /${primaryStep.find}/${primaryStep.flags}${primaryStep.replace !== undefined ? `   |   Replace: ${primaryStep.replace || '(empty)'}` : ''
        }`;

    const items: ActionQuickPickItem[] = [];

    if (outcome.mode === 'replace' || outcome.mode === 'multi-step') {
      items.push({
        label: `$(replace-all) Execute Replace All (${matchCount} match${matchCount === 1 ? '' : 'es'})`,
        description: stepBadge,
        detail: `${outcome.summary}  •  Features: ${outcome.featuresUsed.join(', ')}`,
        alwaysShow: true,
        action: 'replace-all',
        compiled: outcome
      });
    }

    items.push(
      {
        label: `$(selection) Select All Matches with Multi-Caret (${matchCount} match${matchCount === 1 ? '' : 'es'})`,
        description: `/${primaryStep.find}/${primaryStep.flags}`,
        detail: 'Selects every matched span simultaneously so you can type, copy, or run Text Power Tools.',
        alwaysShow: true,
        action: 'select-matches',
        compiled: outcome
      },
      {
        label: `$(edit) Place Carets at Start of Matches (${matchCount})`,
        description: 'Collapsed multi-cursors before each match',
        detail: 'Places an individual blinking cursor at the start of every match.',
        alwaysShow: true,
        action: 'carets-at-start',
        compiled: outcome
      },
      {
        label: `$(edit) Place Carets at End of Matches (${matchCount})`,
        description: 'Collapsed multi-cursors after each match',
        detail: 'Places an individual blinking cursor at the end of every match.',
        alwaysShow: true,
        action: 'carets-at-end',
        compiled: outcome
      },
      {
        label: `$(symbol-variable) Select Capture Group $1 Only (Multi-Caret)`,
        description: 'Targets inner group $1 across all matches',
        detail: 'Selects only the first capture group ($1) in every match.',
        alwaysShow: true,
        action: 'select-group-1',
        compiled: outcome
      },
      {
        label: `$(search) Send to Native VS Code Find/Replace Widget (Ctrl+F / Ctrl+H)`,
        description: stepBadge,
        detail: 'Populates VS Code’s built-in Find & Replace box with the synthesized regular expression.',
        alwaysShow: true,
        action: 'open-in-native-find',
        compiled: outcome
      },
      {
        label: `$(files) Extract All Matches to New Buffer`,
        description: `${matchCount} match(es)`,
        detail: 'Opens a new untitled side editor containing every match on its own line.',
        alwaysShow: true,
        action: 'extract-to-new-file',
        compiled: outcome
      },
      {
        label: `$(clippy) Copy All Matches to Clipboard`,
        description: `${matchCount} match(es)`,
        detail: 'Copies all matched substrings (newline-separated) directly to the system clipboard.',
        alwaysShow: true,
        action: 'copy-matches',
        compiled: outcome
      }
    );

    if (outcome.preferredAction) {
      const preferredIdx = items.findIndex((item) => item.action === outcome.preferredAction);
      if (preferredIdx > 0) {
        const [preferredItem] = items.splice(preferredIdx, 1);
        items.unshift(preferredItem);
      }
    }

    quickPick.items = items;
    if (items.length > 0) {
      quickPick.activeItems = [items[0]];
    }
  };

  const showOrUpdateBarForEditor = (editor: vscode.TextEditor) => {
    currentTrackedEditor = editor;
    const state = getOrCreateTabState(editor);
    state.isActive = true;

    if (activeQuickPick) {
      isProgrammaticValueUpdate = true;
      activeQuickPick.value = state.queryText;
      isProgrammaticValueUpdate = false;
      evaluateAndRenderQuery(state.queryText, editor, activeQuickPick);
      void vscode.commands.executeCommand('setContext', 'regularexpresso.barVisible', true);
      activeQuickPick.show();
      return;
    }

    const quickPick = vscode.window.createQuickPick<ActionQuickPickItem>();
    activeQuickPick = quickPick;
    quickPick.title = 'RegExpresso — Natural Language Find, Replace & Multi-Caret';
    quickPick.placeholder =
      'Type a request (e.g., "rep slashes with tabs", "sel bracket blocks") • Shift+Up/Down for history • Esc to close';
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.ignoreFocusOut = true;
    quickPick.buttons = [prevHistoryButton, nextHistoryButton];

    const getActiveEditor = () => vscode.window.activeTextEditor ?? currentTrackedEditor ?? editor;

    navigateHistoryHandler = (direction: 'prev' | 'next') => {
      if (queryHistory.length === 0) {
        return;
      }
      const ed = getActiveEditor();
      const tabState = getOrCreateTabState(ed);

      if (direction === 'prev') {
        if (tabState.historyIndex === queryHistory.length) {
          tabState.draftQuery = quickPick.value;
        }
        if (tabState.historyIndex > 0) {
          tabState.historyIndex--;
          const nextVal = queryHistory[tabState.historyIndex];
          tabState.queryText = nextVal;
          isProgrammaticValueUpdate = true;
          quickPick.value = nextVal;
          isProgrammaticValueUpdate = false;
          evaluateAndRenderQuery(nextVal, ed, quickPick);
        }
      } else {
        if (tabState.historyIndex < queryHistory.length - 1) {
          tabState.historyIndex++;
          const nextVal = queryHistory[tabState.historyIndex];
          tabState.queryText = nextVal;
          isProgrammaticValueUpdate = true;
          quickPick.value = nextVal;
          isProgrammaticValueUpdate = false;
          evaluateAndRenderQuery(nextVal, ed, quickPick);
        } else if (tabState.historyIndex === queryHistory.length - 1) {
          tabState.historyIndex = queryHistory.length;
          const nextVal = tabState.draftQuery;
          tabState.queryText = nextVal;
          isProgrammaticValueUpdate = true;
          quickPick.value = nextVal;
          isProgrammaticValueUpdate = false;
          evaluateAndRenderQuery(nextVal, ed, quickPick);
        }
      }
    };

    quickPick.onDidTriggerButton((button) => {
      if (button === prevHistoryButton) {
        navigateHistoryHandler?.('prev');
      } else if (button === nextHistoryButton) {
        navigateHistoryHandler?.('next');
      }
    });

    quickPick.onDidChangeValue((value) => {
      const ed = getActiveEditor();
      const tabState = getOrCreateTabState(ed);
      if (!isProgrammaticValueUpdate) {
        tabState.queryText = value;
        if (tabState.historyIndex === queryHistory.length) {
          tabState.draftQuery = value;
        }
      }
      evaluateAndRenderQuery(value, ed, quickPick);
    });

    quickPick.onDidAccept(async () => {
      const selected =
        quickPick.selectedItems[0] ?? quickPick.activeItems[0] ?? quickPick.items[0];
      if (!selected) return;

      const ed = getActiveEditor();
      const tabState = getOrCreateTabState(ed);

      const submittedQuery = quickPick.value.trim();
      if (submittedQuery && queryHistory[queryHistory.length - 1] !== submittedQuery) {
        queryHistory.push(submittedQuery);
      }
      tabState.historyIndex = queryHistory.length;
      tabState.draftQuery = '';
      tabState.queryText = '';

      clearDecorationsOnEditor(ed);

      if (selected.action === 'open-in-native-find') {
        tabState.isActive = false;
        isProgrammaticHide = true;
        quickPick.hide();
        if (selected.compiled) {
          await executeRegexAction(ed, selected.compiled, selected.action);
        }
        return;
      }

      if (selected.action === 'run-workaround' && selected.impossible?.workaround) {
        await executeWorkaround(ed, selected.impossible.workaround);
      } else if (selected.compiled) {
        await executeRegexAction(ed, selected.compiled, selected.action);
      }

      // Keep the QuickPick window open, clear the input box, and remain focused for the next query
      tabState.isActive = true;
      isProgrammaticValueUpdate = true;
      quickPick.value = '';
      isProgrammaticValueUpdate = false;
      quickPick.items = [];
      quickPick.show();
    });

    quickPick.onDidHide(() => {
      void vscode.commands.executeCommand('setContext', 'regularexpresso.barVisible', false);
      clearDecorationsOnEditor(currentTrackedEditor);
      activeQuickPick = undefined;
      navigateHistoryHandler = undefined;
      isProgrammaticHide = false;
      quickPick.dispose();
    });

    void vscode.commands.executeCommand('setContext', 'regularexpresso.barVisible', true);
    isProgrammaticValueUpdate = true;
    quickPick.value = state.queryText;
    isProgrammaticValueUpdate = false;
    quickPick.show();
    evaluateAndRenderQuery(state.queryText, editor, quickPick);
  };

  const openBarDisposable = vscode.commands.registerCommand('regularexpresso.openBar', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('Open a text editor first to use RegExpresso.');
      return;
    }

    const state = getOrCreateTabState(editor);
    state.isActive = true;
    showOrUpdateBarForEditor(editor);
  });

  const closeBarDisposable = vscode.commands.registerCommand('regularexpresso.closeBar', () => {
    if (tabSwitchTimer) {
      clearTimeout(tabSwitchTimer);
      tabSwitchTimer = undefined;
    }
    const editor = vscode.window.activeTextEditor ?? currentTrackedEditor;
    if (editor) {
      const state = getOrCreateTabState(editor);
      state.isActive = false;
      clearDecorationsOnEditor(editor);
    }
    if (activeQuickPick) {
      isProgrammaticHide = true;
      activeQuickPick.hide();
    }
  });

  const historyPrevDisposable = vscode.commands.registerCommand(
    'regularexpresso.historyPrevious',
    () => {
      navigateHistoryHandler?.('prev');
    }
  );

  const historyNextDisposable = vscode.commands.registerCommand(
    'regularexpresso.historyNext',
    () => {
      navigateHistoryHandler?.('next');
    }
  );

  // Synchronize RegExpresso UI state whenever the user switches editor tabs (via mouse click or Ctrl+Tab)
  const activeEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor((newEditor) => {
    if (tabSwitchTimer) {
      clearTimeout(tabSwitchTimer);
      tabSwitchTimer = undefined;
    }

    if (!newEditor) {
      clearDecorationsOnEditor(currentTrackedEditor);
      // Wait briefly in case this `undefined` is an intermediate event between two text tabs
      tabSwitchTimer = setTimeout(() => {
        if (!vscode.window.activeTextEditor && activeQuickPick) {
          isProgrammaticHide = true;
          activeQuickPick.hide();
        }
      }, 60);
      return;
    }

    if (currentTrackedEditor && currentTrackedEditor !== newEditor) {
      clearDecorationsOnEditor(currentTrackedEditor);
    }
    currentTrackedEditor = newEditor;

    const targetState = getOrCreateTabState(newEditor);

    if (targetState.isActive) {
      if (activeQuickPick) {
        // QuickPick stayed visible (e.g., mouse click on tab): update value and preview immediately
        showOrUpdateBarForEditor(newEditor);
      } else {
        // QuickPick was hidden by Ctrl+Tab switcher or previous inactive tab: restore after switcher closes
        tabSwitchTimer = setTimeout(() => {
          const activeEd = vscode.window.activeTextEditor;
          if (activeEd && activeEd === newEditor && getOrCreateTabState(activeEd).isActive) {
            showOrUpdateBarForEditor(activeEd);
          }
        }, 45);
      }
    } else {
      clearDecorationsOnEditor(newEditor);
      if (activeQuickPick) {
        isProgrammaticHide = true;
        activeQuickPick.hide();
      }
    }
  });

  const closeDocDisposable = vscode.workspace.onDidCloseTextDocument((doc) => {
    tabStates.delete(doc.uri.toString());
  });

  context.subscriptions.push(
    openBarDisposable,
    closeBarDisposable,
    historyPrevDisposable,
    historyNextDisposable,
    activeEditorChangeDisposable,
    closeDocDisposable,
    matchHighlightDecoration,
    replacementPreviewDecoration
  );
}

export function deactivate() { }
