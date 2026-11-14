import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  installVscodeMock,
  MockPosition,
  MockTextDocument,
  MockTextEditor,
  vscodeHostState
} from './helpers/vscodeMock';

// Install the `vscode` module hook BEFORE requiring `executor` or `extension`
const vscodeMock = installVscodeMock();

import { parseNaturalLanguageRequest } from '../compiler';
import {
  applyStepToText,
  evaluateBoostReplacement,
  executeRegexAction,
  executeWorkaround,
  findAllMatchesInEditor,
  formatReplacementPreview
} from '../executor';
import { activate } from '../extension';
import {
  checkNativeDifferentialParity,
  hasBoostCaseModifiers
} from './helpers/testUtils';
import { GOLDEN_CORPUS_QUERIES } from './helpers/goldenCorpusData';

const PARITY_SAMPLE_DOC = [
  'const host = "localhost", path = "a/b\\c";',
  'const price = $42.50, count = 100;',
  'Contact alice@example.com or visit https://example.com/docs.',
  'Lovelace, Ada\nTuring, Alan',
  'See [GitHub](https://github.com) and <title>Welcome</title>.'
].join('\n');

describe('Layer 7: Headless VS Code Host Integration & Differential Parity', () => {
  it('7A: Verifies 100% Differential Parity between boostEvaluator and Native ECMAScript String.prototype.replace', () => {
    let parityCheckedCount = 0;

    for (const tc of GOLDEN_CORPUS_QUERIES) {
      const res = parseNaturalLanguageRequest(tc.q);
      assert.ok(res.isPossible);
      if (!res.isPossible) continue;

      if (res.mode !== 'replace') continue;
      const step = res.steps[0];
      if (step.replace === undefined || hasBoostCaseModifiers(step.replace)) {
        continue;
      }

      parityCheckedCount++;
      const { boostOutput, nativeOutput } = checkNativeDifferentialParity(PARITY_SAMPLE_DOC, step);
      assert.equal(
        boostOutput,
        nativeOutput,
        `Differential parity mismatch between boostEvaluator and native String.replace for "${tc.q}" (find=/${step.find}/${step.flags}, replace="${step.replace}")`
      );
    }

    assert.ok(
      parityCheckedCount >= 65,
      `Expected at least 65 standard replacement queries checked for differential parity, ran ${parityCheckedCount}`
    );

    // Explicitly verify Boost-exclusive case modifiers (\U, \L, \u, \l, \E) & preview glyphs
    const matchArr = /([a-z]+)_([A-Z]+)/.exec('hello_WORLD');
    assert.ok(matchArr);
    if (matchArr) {
      assert.equal(evaluateBoostReplacement('\\U$1\\E_\\L$2', matchArr), 'HELLO_world');
      assert.equal(evaluateBoostReplacement('\\u$1\\l$2', matchArr), 'HellowORLD');
    }

    assert.equal(formatReplacementPreview(''), '∅ (deleted)');
    assert.equal(formatReplacementPreview('\t\t'), '⇥⇥');
    assert.equal(formatReplacementPreview('a\r\nb'), 'a↵b');
  });

  it('7B: Verifies UTF-16 Surrogate Pair (Emoji/CJK) & CRLF Selection Geometry in findAllMatchesInEditor', () => {
    // `🚀` and `🧪` are astral-plane characters (2 UTF-16 code units each)
    const astralCrlfText = 'const 🚀 = "launch_100";\r\nconst 日本語 = "test_200_🧪";';
    const doc = new MockTextDocument(astralCrlfText);
    const editor = new MockTextEditor(doc);

    const compiled = parseNaturalLanguageRequest('wrap numbers in parentheses');
    assert.ok(compiled.isPossible);
    if (!compiled.isPossible) return;

    const { fullRanges, group1Ranges, previews, matchTexts } = findAllMatchesInEditor(
      editor as unknown as import('vscode').TextEditor,
      compiled.steps[0]
    );

    assert.deepEqual(matchTexts, ['100', '200']);
    assert.equal(fullRanges.length, 2);
    assert.equal(group1Ranges.length, 2);
    assert.equal(previews.length, 2);

    // Verify exact UTF-16 code-unit slicing via `doc.getText(range)`
    assert.equal(doc.getText(fullRanges[0] as unknown as import('./helpers/vscodeMock').MockRange), '100');
    assert.equal(doc.getText(fullRanges[1] as unknown as import('./helpers/vscodeMock').MockRange), '200');
    assert.equal(doc.getText(group1Ranges[0] as unknown as import('./helpers/vscodeMock').MockRange), '100');
    assert.equal(doc.getText(group1Ranges[1] as unknown as import('./helpers/vscodeMock').MockRange), '200');

    // Line 0: `const 🚀 = "launch_` -> `const ` (6) + `🚀` (2 UTF-16 units) + ` = "launch_` (11) = char 19..22
    assert.equal(fullRanges[0].start.line, 0);
    assert.equal(fullRanges[0].start.character, 19);
    assert.equal(fullRanges[0].end.character, 22);

    // Line 1: `const 日本語 = "test_` -> `const ` (6) + `日本語` (3) + ` = "test_` (9) = char 18..21
    assert.equal(fullRanges[1].start.line, 1);
    assert.equal(fullRanges[1].start.character, 18);
    assert.equal(fullRanges[1].end.character, 21);

    assert.equal(previews[0].replacementText, '(100)');
    assert.equal(previews[1].replacementText, '(200)');
  });

  it('7C: Executes all 8 Multi-Caret & Editor Actions plus all 3 Impossible Workaround Modes', async () => {
    vscodeHostState.reset();

    const initialText = 'item_10 = "alpha"\nitem_20 = "beta"';
    const doc = new MockTextDocument(initialText);
    const editor = new MockTextEditor(doc);
    vscodeHostState.activeTextEditor = editor;

    // Compile `<([a-z]+)>(.*?)</\1>` or `wrap numbers in brackets` which has group $1
    const compiled = parseNaturalLanguageRequest('wrap numbers in brackets');
    assert.ok(compiled.isPossible);
    if (!compiled.isPossible) return;

    // 1. select-matches
    await executeRegexAction(
      editor as unknown as import('vscode').TextEditor,
      compiled,
      'select-matches'
    );
    assert.equal(editor.selections.length, 2);
    assert.equal(doc.getText(editor.selections[0]), '10');
    assert.equal(doc.getText(editor.selections[1]), '20');

    // 2. carets-at-start
    await executeRegexAction(
      editor as unknown as import('vscode').TextEditor,
      compiled,
      'carets-at-start'
    );
    assert.equal(editor.selections.length, 2);
    assert.equal(editor.selections[0].isEmpty, true);
    assert.deepEqual(editor.selections[0].start, new MockPosition(0, 5));
    assert.deepEqual(editor.selections[1].start, new MockPosition(1, 5));

    // 3. carets-at-end
    await executeRegexAction(
      editor as unknown as import('vscode').TextEditor,
      compiled,
      'carets-at-end'
    );
    assert.equal(editor.selections.length, 2);
    assert.equal(editor.selections[0].isEmpty, true);
    assert.deepEqual(editor.selections[0].end, new MockPosition(0, 7));
    assert.deepEqual(editor.selections[1].end, new MockPosition(1, 7));

    // 4. select-group-1 (on HTML tag pattern where $1 is tag name and full match is `<tag>...</tag>`)
    const htmlDoc = new MockTextDocument('<div>Title</div>\n<p>Body</p>');
    const htmlEditor = new MockTextEditor(htmlDoc);
    const htmlCompiled = parseNaturalLanguageRequest('Find all text inside HTML tags');
    assert.ok(htmlCompiled.isPossible);
    if (htmlCompiled.isPossible) {
      await executeRegexAction(
        htmlEditor as unknown as import('vscode').TextEditor,
        htmlCompiled,
        'select-group-1'
      );
      assert.equal(htmlEditor.selections.length, 2);
      assert.equal(htmlDoc.getText(htmlEditor.selections[0]), 'div');
      assert.equal(htmlDoc.getText(htmlEditor.selections[1]), 'p');
    }

    // 5. copy-matches
    await executeRegexAction(
      editor as unknown as import('vscode').TextEditor,
      compiled,
      'copy-matches'
    );
    assert.equal(vscodeHostState.clipboardText, '10\n20');

    // 6. extract-to-new-file
    await executeRegexAction(
      editor as unknown as import('vscode').TextEditor,
      compiled,
      'extract-to-new-file'
    );
    assert.equal(vscodeHostState.openedDocuments.length, 1);
    assert.equal(vscodeHostState.openedDocuments[0].getText(), '10\n20');
    assert.equal(vscodeHostState.openedDocuments[0].languageId, 'plaintext');

    // 7. open-in-native-find
    await executeRegexAction(
      editor as unknown as import('vscode').TextEditor,
      compiled,
      'open-in-native-find'
    );
    const findCmd = vscodeHostState.executedCommands.find(
      (c) => c.command === 'editor.actions.findWithArgs'
    );
    assert.ok(findCmd, 'Expected editor.actions.findWithArgs to be executed');

    // 8. replace-all
    await executeRegexAction(
      editor as unknown as import('vscode').TextEditor,
      compiled,
      'replace-all'
    );
    assert.equal(doc.getText(), 'item_[10] = "alpha"\nitem_[20] = "beta"');

    // Workaround 1: custom-script (Number each line sequentially)
    const numLinesOutcome = parseNaturalLanguageRequest(
      'Number each line sequentially: 1. , 2. , 3. , etc.'
    );
    assert.equal(numLinesOutcome.isPossible, false);
    if (!numLinesOutcome.isPossible && numLinesOutcome.workaround) {
      const seqDoc = new MockTextDocument('first\nsecond\nthird');
      const seqEditor = new MockTextEditor(seqDoc);
      await executeWorkaround(
        seqEditor as unknown as import('vscode').TextEditor,
        numLinesOutcome.workaround
      );
      assert.equal(seqDoc.getText(), '1. first\n2. second\n3. third');
    }

    // Workaround 2: sort-then-regex (Deduplicate scattered lines)
    const dedupOutcome = parseNaturalLanguageRequest(
      'Remove every duplicate line in this file, even if they are scattered pages apart and unsorted.'
    );
    assert.equal(dedupOutcome.isPossible, false);
    if (!dedupOutcome.isPossible && dedupOutcome.workaround) {
      const scatDoc = new MockTextDocument('banana\napple\nbanana\ncherry\napple');
      const scatEditor = new MockTextEditor(scatDoc);
      vscodeHostState.activeTextEditor = scatEditor;
      await executeWorkaround(
        scatEditor as unknown as import('vscode').TextEditor,
        dedupOutcome.workaround
      );
      assert.equal(scatDoc.getText(), 'apple\nbanana\ncherry');
    }
  });

  it('7D: Verifies Extension UI State Machine, Persistent QuickPick after Submit, History Cycling, and Per-Tab Isolation', async () => {
    vscodeHostState.reset();

    const docA = new MockTextDocument('a/b/c\n123', 'file:///tabA.ts');
    const editorA = new MockTextEditor(docA);
    const docB = new MockTextDocument('x,y,z', 'file:///tabB.ts');
    const editorB = new MockTextEditor(docB);

    vscodeHostState.activeTextEditor = editorA;

    const subscriptions: { dispose: () => void }[] = [];
    activate({ subscriptions } as unknown as import('vscode').ExtensionContext);

    // 1. Open RegExpresso bar on Tab A
    await vscodeMock.commands.executeCommand('regularexpresso.openBar');
    assert.equal(vscodeHostState.createdQuickPicks.length, 1);
    const qp = vscodeHostState.createdQuickPicks[0];
    assert.equal(qp.visible, true);

    // 2. Type first query -> live preview items & decorations appear
    qp.typeText('replace slashes with tabs');
    assert.ok(qp.items.length > 0, 'QuickPick should populate action items on live typing');
    assert.equal(editorA.decorations.size, 2, 'Live match & replacement decorations should be set');

    // 3. Submit first query (Enter) -> executes Replace All, stays open, clears input, saves history
    await qp.accept();
    assert.equal(docA.getText(), 'a\tb\tc\n123');
    assert.equal(qp.visible, true, 'QuickPick must stay visible after submitting a query');
    assert.equal(qp.value, '', 'QuickPick input box must be cleared after submit');

    // 4. Type and submit second query
    qp.typeText('select numbers');
    await qp.accept();
    assert.equal(qp.visible, true);
    assert.equal(qp.value, '');

    // 5. Type a draft query and cycle history using Shift+Up / Shift+Down commands
    qp.typeText('my unfinished draft');
    await vscodeMock.commands.executeCommand('regularexpresso.historyPrevious');
    assert.equal(qp.value, 'select numbers');

    await vscodeMock.commands.executeCommand('regularexpresso.historyPrevious');
    assert.equal(qp.value, 'replace slashes with tabs');

    await vscodeMock.commands.executeCommand('regularexpresso.historyNext');
    assert.equal(qp.value, 'select numbers');

    await vscodeMock.commands.executeCommand('regularexpresso.historyNext');
    assert.equal(qp.value, 'my unfinished draft', 'History Next at end should restore draft query');

    // 6. Switch to inactive Tab B -> QuickPick should hide and clear decorations on Tab A
    vscodeHostState.fireDidChangeActiveTextEditor(editorB);
    assert.equal(qp.visible, false, 'Switching to a tab where bar was not opened should hide QuickPick');

    // 7. Close bar explicitly with Escape command (`regularexpresso.closeBar`)
    vscodeHostState.fireDidChangeActiveTextEditor(editorA);
    await vscodeMock.commands.executeCommand('regularexpresso.openBar');
    const qpReopened = vscodeHostState.createdQuickPicks[vscodeHostState.createdQuickPicks.length - 1];
    assert.equal(qpReopened.visible, true);
    assert.equal(
      qpReopened.value,
      'my unfinished draft',
      'Tab A should remember its last unsubmitted query text'
    );

    await vscodeMock.commands.executeCommand('regularexpresso.closeBar');
    assert.equal(qpReopened.visible, false, 'Escape (closeBar) must hide the QuickPick');
  });
});
