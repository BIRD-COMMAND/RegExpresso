import * as vscode from 'vscode';
import { parseNaturalLanguageRequest } from './nlParser';
import {
  executeRegexAction,
  executeWorkaround,
  findAllMatchesInEditor
} from './executor';
import {
  CompiledRegexResult,
  ExecutionAction,
  ImpossibleRegexResult
} from './types';

interface ActionQuickPickItem extends vscode.QuickPickItem {
  action: ExecutionAction;
  compiled?: CompiledRegexResult;
  impossible?: ImpossibleRegexResult;
}

export function activate(context: vscode.ExtensionContext) {
  // Session-persistent query history for the lifetime of the running extension
  const queryHistory: string[] = [];
  let activeQuickPick: vscode.QuickPick<ActionQuickPickItem> | undefined;
  let navigateHistoryHandler: ((direction: 'prev' | 'next') => void) | undefined;

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

  const prevHistoryButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('arrow-up'),
    tooltip: 'Previous Query in History (Shift+Up)'
  };

  const nextHistoryButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('arrow-down'),
    tooltip: 'Next Query in History (Shift+Down)'
  };

  const disposable = vscode.commands.registerCommand('regularexpresso.openBar', () => {
    const initialEditor = vscode.window.activeTextEditor;
    if (!initialEditor) {
      vscode.window.showInformationMessage('Open a text editor first to use RegExpresso.');
      return;
    }

    if (activeQuickPick) {
      activeQuickPick.show();
      return;
    }

    const quickPick = vscode.window.createQuickPick<ActionQuickPickItem>();
    activeQuickPick = quickPick;
    quickPick.title = 'RegExpresso — Natural Language Find, Replace & Multi-Caret';
    quickPick.placeholder =
      'Type a request (e.g., "rep slashes with tabs", "rm last 4 per") • Shift+Up/Down for history • Esc to close';
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.ignoreFocusOut = true;
    quickPick.buttons = [prevHistoryButton, nextHistoryButton];

    let historyIndex = queryHistory.length;
    let draftQuery = '';
    let isProgrammaticValueUpdate = false;

    const getEditor = () => vscode.window.activeTextEditor ?? initialEditor;

    const clearDecorations = () => {
      const ed = getEditor();
      ed.setDecorations(matchHighlightDecoration, []);
      ed.setDecorations(replacementPreviewDecoration, []);
    };

    const evaluateAndRenderQuery = (value: string) => {
      const editor = getEditor();
      const trimmed = value.trim();
      if (!trimmed) {
        quickPick.items = [];
        clearDecorations();
        return;
      }

      const outcome = parseNaturalLanguageRequest(trimmed);

      if (!outcome.isPossible) {
        clearDecorations();
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
                contentText: `→ ${p.replacementText === '' ? '∅ (deleted)' : p.replacementText.replace(/\r?\n/g, '↵')}`
              }
            }
          }));
          editor.setDecorations(replacementPreviewDecoration, previewOptions);
        } else {
          editor.setDecorations(replacementPreviewDecoration, []);
        }
      } catch {
        clearDecorations();
      }

      const stepBadge =
        outcome.steps.length > 1
          ? `[${outcome.steps.length}-Step Pipeline] ${outcome.steps.map((s) => `/${s.find}/ → "${s.replace ?? ''}"`).join('  ⇒  ')}`
          : `Find: /${primaryStep.find}/${primaryStep.flags}${
              primaryStep.replace !== undefined ? `   |   Replace: ${primaryStep.replace || '(empty)'}` : ''
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

    navigateHistoryHandler = (direction: 'prev' | 'next') => {
      if (queryHistory.length === 0) {
        return;
      }

      if (direction === 'prev') {
        if (historyIndex === queryHistory.length) {
          draftQuery = quickPick.value;
        }
        if (historyIndex > 0) {
          historyIndex--;
          isProgrammaticValueUpdate = true;
          quickPick.value = queryHistory[historyIndex];
          isProgrammaticValueUpdate = false;
          evaluateAndRenderQuery(quickPick.value);
        }
      } else {
        if (historyIndex < queryHistory.length - 1) {
          historyIndex++;
          isProgrammaticValueUpdate = true;
          quickPick.value = queryHistory[historyIndex];
          isProgrammaticValueUpdate = false;
          evaluateAndRenderQuery(quickPick.value);
        } else if (historyIndex === queryHistory.length - 1) {
          historyIndex = queryHistory.length;
          isProgrammaticValueUpdate = true;
          quickPick.value = draftQuery;
          isProgrammaticValueUpdate = false;
          evaluateAndRenderQuery(quickPick.value);
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
      if (!isProgrammaticValueUpdate && historyIndex === queryHistory.length) {
        draftQuery = value;
      }
      evaluateAndRenderQuery(value);
    });

    quickPick.onDidAccept(async () => {
      const selected =
        quickPick.selectedItems[0] ?? quickPick.activeItems[0] ?? quickPick.items[0];
      if (!selected) return;

      const submittedQuery = quickPick.value.trim();
      if (submittedQuery && queryHistory[queryHistory.length - 1] !== submittedQuery) {
        queryHistory.push(submittedQuery);
      }
      historyIndex = queryHistory.length;
      draftQuery = '';

      clearDecorations();
      const editor = getEditor();

      if (selected.action === 'open-in-native-find') {
        quickPick.hide();
        if (selected.compiled) {
          await executeRegexAction(editor, selected.compiled, selected.action);
        }
        return;
      }

      if (selected.action === 'run-workaround' && selected.impossible?.workaround) {
        await executeWorkaround(editor, selected.impossible.workaround);
      } else if (selected.compiled) {
        await executeRegexAction(editor, selected.compiled, selected.action);
      }

      // Keep the QuickPick window open, clear the input box, and remain focused for the next query
      isProgrammaticValueUpdate = true;
      quickPick.value = '';
      isProgrammaticValueUpdate = false;
      quickPick.items = [];
      quickPick.show();
    });

    quickPick.onDidHide(() => {
      void vscode.commands.executeCommand('setContext', 'regularexpresso.barVisible', false);
      clearDecorations();
      activeQuickPick = undefined;
      navigateHistoryHandler = undefined;
      quickPick.dispose();
    });

    void vscode.commands.executeCommand('setContext', 'regularexpresso.barVisible', true);
    quickPick.show();
  });

  context.subscriptions.push(
    disposable,
    historyPrevDisposable,
    historyNextDisposable,
    matchHighlightDecoration,
    replacementPreviewDecoration
  );
}

export function deactivate() {}
