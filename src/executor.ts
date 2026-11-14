import * as vscode from 'vscode';
import {
  CompiledRegexResult,
  ExecutionAction,
  ImpossibleWorkaround,
  RegexStep
} from './types';
import {
  applyStepToText,
  evaluateBoostReplacement,
  formatReplacementPreview
} from './engine/boostEvaluator';

export { applyStepToText, evaluateBoostReplacement, formatReplacementPreview };

/**
 * Collects all match ranges and capture group ranges in the active editor.
 */
export function findAllMatchesInEditor(
  editor: vscode.TextEditor,
  step: RegexStep
): {
  fullRanges: vscode.Range[];
  group1Ranges: vscode.Range[];
  previews: { range: vscode.Range; replacementText: string }[];
  matchTexts: string[];
} {
  const doc = editor.document;
  const fullText = doc.getText();
  const flags = step.flags.includes('g') ? step.flags : step.flags + 'g';
  const regex = new RegExp(step.find, flags);

  const fullRanges: vscode.Range[] = [];
  const group1Ranges: vscode.Range[] = [];
  const previews: { range: vscode.Range; replacementText: string }[] = [];
  const matchTexts: string[] = [];

  let match: RegExpExecArray | null;
  let safetyCounter = 0;

  while ((match = regex.exec(fullText)) !== null && safetyCounter < 5000) {
    if (
      match[0].length === 0 &&
      match.index > 0 &&
      fullText[match.index - 1] === '\r' &&
      fullText[match.index] === '\n'
    ) {
      regex.lastIndex = match.index + 1;
      continue;
    }
    safetyCounter++;
    const startPos = doc.positionAt(match.index);
    const endPos = doc.positionAt(match.index + match[0].length);
    const range = new vscode.Range(startPos, endPos);

    fullRanges.push(range);
    matchTexts.push(match[0]);

    if (match[1] !== undefined) {
      const groupOffset = match[0].indexOf(match[1]);
      if (groupOffset !== -1) {
        const gStart = doc.positionAt(match.index + groupOffset);
        const gEnd = doc.positionAt(match.index + groupOffset + match[1].length);
        group1Ranges.push(new vscode.Range(gStart, gEnd));
      }
    }

    if (step.replace !== undefined) {
      previews.push({
        range,
        replacementText: evaluateBoostReplacement(step.replace, match)
      });
    }

    if (match[0].length === 0) {
      const stepLen =
        fullText[regex.lastIndex] === '\r' && fullText[regex.lastIndex + 1] === '\n' ? 2 : 1;
      regex.lastIndex += stepLen;
    }
  }

  return { fullRanges, group1Ranges, previews, matchTexts };
}

/**
 * Executes the selected action (Replace All, Multi-Caret Select, Carets at Start/End, Native Find, etc.)
 */
export async function executeRegexAction(
  editor: vscode.TextEditor,
  compiled: CompiledRegexResult,
  action: ExecutionAction
): Promise<void> {
  const doc = editor.document;
  const primaryStep = compiled.steps[0];

  if (action === 'replace-all') {
    const fullText = doc.getText();
    let currentText = fullText;
    let totalMatches = 0;

    for (const step of compiled.steps) {
      const { newText, matchCount } = applyStepToText(currentText, step);
      currentText = newText;
      totalMatches += matchCount;
    }

    const fullDocRange = new vscode.Range(doc.positionAt(0), doc.positionAt(fullText.length));

    await editor.edit((editBuilder) => {
      editBuilder.replace(fullDocRange, currentText);
    });

    vscode.window.setStatusBarMessage(
      `RegExpresso: Applied ${compiled.steps.length} step(s) across ${totalMatches} match(es).`,
      4000
    );
    return;
  }

  const { fullRanges, group1Ranges, matchTexts } = findAllMatchesInEditor(editor, primaryStep);

  if (fullRanges.length === 0 && action !== 'open-in-native-find') {
    vscode.window.showWarningMessage(
      `No matches found for /${primaryStep.find}/${primaryStep.flags}`
    );
    return;
  }

  switch (action) {
    case 'select-matches': {
      editor.selections = fullRanges.map((r) => new vscode.Selection(r.start, r.end));
      editor.revealRange(fullRanges[0]);
      vscode.window.setStatusBarMessage(
        `RegExpresso: Selected ${fullRanges.length} match(es) with multi-caret.`,
        4000
      );
      break;
    }

    case 'carets-at-start': {
      editor.selections = fullRanges.map((r) => new vscode.Selection(r.start, r.start));
      editor.revealRange(fullRanges[0]);
      vscode.window.setStatusBarMessage(
        `RegExpresso: Placed ${fullRanges.length} caret(s) at start of matches.`,
        4000
      );
      break;
    }

    case 'carets-at-end': {
      editor.selections = fullRanges.map((r) => new vscode.Selection(r.end, r.end));
      editor.revealRange(fullRanges[0]);
      vscode.window.setStatusBarMessage(
        `RegExpresso: Placed ${fullRanges.length} caret(s) at end of matches.`,
        4000
      );
      break;
    }

    case 'select-group-1': {
      const targetRanges = group1Ranges.length > 0 ? group1Ranges : fullRanges;
      editor.selections = targetRanges.map((r) => new vscode.Selection(r.start, r.end));
      editor.revealRange(targetRanges[0]);
      vscode.window.setStatusBarMessage(
        `RegExpresso: Selected ${targetRanges.length} capture group $1 occurrence(s).`,
        4000
      );
      break;
    }

    case 'copy-matches': {
      await vscode.env.clipboard.writeText(matchTexts.join('\n'));
      vscode.window.setStatusBarMessage(
        `RegExpresso: Copied ${matchTexts.length} match(es) to clipboard.`,
        4000
      );
      break;
    }

    case 'extract-to-new-file': {
      const newDoc = await vscode.workspace.openTextDocument({
        content: matchTexts.join('\n'),
        language: 'plaintext'
      });
      await vscode.window.showTextDocument(newDoc, vscode.ViewColumn.Beside);
      break;
    }

    case 'open-in-native-find': {
      await vscode.commands.executeCommand('editor.actions.findWithArgs', {
        searchString: primaryStep.find,
        replaceString: primaryStep.replace ?? '',
        isRegex: true,
        matchWholeWord: false,
        isCaseSensitive: !primaryStep.flags.includes('i')
      });
      break;
    }
  }
}

/**
 * Executes native workarounds when a user asks for an impossible regex operation.
 */
export async function executeWorkaround(
  editor: vscode.TextEditor,
  workaround: ImpossibleWorkaround
): Promise<void> {
  if (workaround.actionType === 'vscode-command' && workaround.commandId) {
    await vscode.commands.executeCommand(workaround.commandId);
    return;
  }

  if (
    workaround.actionType === 'sort-then-regex' &&
    workaround.commandId &&
    workaround.followUpStep
  ) {
    await vscode.commands.executeCommand(workaround.commandId);
    const fullText = editor.document.getText();
    const { newText } = applyStepToText(fullText, workaround.followUpStep);
    const fullRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(fullText.length)
    );
    await editor.edit((eb) => eb.replace(fullRange, newText));
    return;
  }

  if (workaround.actionType === 'custom-script') {
    const doc = editor.document;
    await editor.edit((eb) => {
      for (let i = 0; i < doc.lineCount; i++) {
        eb.insert(new vscode.Position(i, 0), `${i + 1}. `);
      }
    });
  }
}
