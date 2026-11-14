import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseNaturalLanguageRequest } from '../compiler';
import { applyStepToText } from '../engine/boostEvaluator';
import { executeStepsOnText, extractMatchDetails, runDualLineEndings } from './helpers/testUtils';

const METAMORPHIC_FIXTURE = [
  'const user_name = "Alice_Smith", role = \'Admin\';',
  'const scores = [100, 250, 42]; // path/to/file\twith\ttabs',
  'const config = {retry: 3, timeout: 5000};',
  'fn(alpha, beta) + `template_str` - 99.95;'
].join('\n');

const CONSERVATION_TARGETS = [
  'words',
  'numbers',
  'digits',
  'caps',
  'lowercase',
  'slashes',
  'tabs',
  'quotes',
  'periods',
  'underscores',
  'commas',
  'semicolons',
  'colons',
  'hyphens',
  'vowels',
  'consonants',
  'bracket blocks',
  'brace blocks',
  'paren blocks',
  'quote blocks',
  'strings',
  'quoted text',
  'bracketed text',
  'braced text',
  'parenthesized text',
  '\\d{2,4}'
];

const FIXED_LITERAL_TARGETS = [
  'tabs',
  'commas',
  'semicolons',
  'colons',
  'periods',
  'underscores',
  'hyphens',
  'backticks',
  'double quotes',
  'single quotes'
];

describe('Layer 3: Algebraic & Metamorphic Symmetry Laws', () => {
  it('3A: Law 1 — Match-to-Deletion Conservation (Character Length Delta === Sum of Matched Span Lengths)', () => {
    runDualLineEndings(METAMORPHIC_FIXTURE, (docText, _eol, modeLabel) => {
      for (const target of CONSERVATION_TARGETS) {
        const findRes = parseNaturalLanguageRequest(`find ${target}`);
        const delRes = parseNaturalLanguageRequest(`delete ${target}`);

        assert.ok(
          findRes.isPossible && delRes.isPossible,
          `[${modeLabel}] Both find and delete must be possible for "${target}"`
        );
        if (!findRes.isPossible || !delRes.isPossible) continue;

        const findStep = findRes.steps[0];
        const delStep = delRes.steps[0];

        assert.equal(
          delStep.find,
          findStep.find,
          `[${modeLabel}] Find and Delete regex patterns diverged for "${target}"`
        );
        assert.equal(
          delStep.replace,
          '',
          `[${modeLabel}] Expected empty replacement for "delete ${target}"`
        );

        const matches = extractMatchDetails(docText, findStep).fullMatches;
        const totalMatchedChars = matches.reduce((sum, m) => sum + m.length, 0);

        const deletedText = executeStepsOnText(docText, delRes.steps);
        const charDelta = docText.length - deletedText.length;

        assert.equal(
          charDelta,
          totalMatchedChars,
          `[${modeLabel}] Conservation law violated for "${target}": deleted ${charDelta} chars, but matched ${totalMatchedChars} chars`
        );
      }
    });
  });

  it('3A-Special: Verifies duplicate-word collapsing ($1) and whole-line deletion (\\r?\\n?) semantics', () => {
    // 1. Duplicate words collapse to `$1` rather than `""`
    const dupRes = parseNaturalLanguageRequest('delete duplicate words');
    assert.ok(dupRes.isPossible);
    if (dupRes.isPossible) {
      assert.equal(dupRes.steps[0].replace, '$1');
      const sample = 'This is is a test test string.';
      assert.equal(executeStepsOnText(sample, dupRes.steps), 'This is a test string.');
    }

    // 2. Whole-line deletion consumes trailing `\r?\n?` so no empty ghost line remains
    const lineDelRes = parseNaturalLanguageRequest('delete lines starting with #');
    assert.ok(lineDelRes.isPossible);
    if (lineDelRes.isPossible) {
      runDualLineEndings('line 1\n# comment line\nline 2', (text, eol, modeLabel) => {
        const out = executeStepsOnText(text, lineDelRes.steps);
        assert.equal(
          out,
          `line 1${eol}line 2`,
          `[${modeLabel}] Whole-line deletion should remove the line break cleanly`
        );
      });
    }
  });

  it('3B: Law 2 — Identity Replacement Invariant ($& Self-Replacement & Fixed-Literal <T> with <T>)', () => {
    runDualLineEndings(METAMORPHIC_FIXTURE, (docText, _eol, modeLabel) => {
      // Part 1: Replacing any matched target span with `$&` is a strict identity operation
      for (const target of CONSERVATION_TARGETS) {
        const findRes = parseNaturalLanguageRequest(`find ${target}`);
        assert.ok(findRes.isPossible);
        if (!findRes.isPossible) continue;

        const identityStep = {
          ...findRes.steps[0],
          replace: '$&'
        };
        const out = applyStepToText(docText, identityStep).newText;
        assert.equal(
          out,
          docText,
          `[${modeLabel}] Identity $& replacement mutated document for target "${target}"`
        );
      }

      // Part 2: `replace <T> with <T>` on fixed-literal lexicon targets is a strict identity operation
      for (const literalTarget of FIXED_LITERAL_TARGETS) {
        const selfRepRes = parseNaturalLanguageRequest(
          `replace ${literalTarget} with ${literalTarget}`
        );
        assert.ok(
          selfRepRes.isPossible,
          `[${modeLabel}] "replace ${literalTarget} with ${literalTarget}" must be possible`
        );
        if (!selfRepRes.isPossible) continue;

        const out = executeStepsOnText(docText, selfRepRes.steps);
        assert.equal(
          out,
          docText,
          `[${modeLabel}] Self-replacement "replace ${literalTarget} with ${literalTarget}" mutated document`
        );
      }
    });
  });

  it('3C: Law 3 — Wrap / Unwrap Round-Trip Symmetry (Parentheses, Brackets, Braces, Quotes)', () => {
    const cleanDoc = 'Order 105 costs 250 dollars and has 42 items.';

    const roundTripPairs: {
      wrapQuery: string;
      unwrapQuery: string;
      expectedIntermediate: string;
    }[] = [
      {
        wrapQuery: 'wrap numbers in brackets',
        unwrapQuery: 'replace `\\[(\\d+)\\]` with `$1`',
        expectedIntermediate: 'Order [105] costs [250] dollars and has [42] items.'
      },
      {
        wrapQuery: 'wrap numbers in parentheses',
        unwrapQuery: 'replace `\\((\\d+)\\)` with `$1`',
        expectedIntermediate: 'Order (105) costs (250) dollars and has (42) items.'
      },
      {
        wrapQuery: 'wrap numbers in braces',
        unwrapQuery: 'replace `\\{(\\d+)\\}` with `$1`',
        expectedIntermediate: 'Order {105} costs {250} dollars and has {42} items.'
      },
      {
        wrapQuery: 'put double quotes around numbers',
        unwrapQuery: 'replace `"(\\d+)"` with `$1`',
        expectedIntermediate: 'Order "105" costs "250" dollars and has "42" items.'
      },
      {
        wrapQuery: 'put single quotes around numbers',
        unwrapQuery: 'replace `\'(\\d+)\'` with `$1`',
        expectedIntermediate: "Order '105' costs '250' dollars and has '42' items."
      }
    ];

    for (const pair of roundTripPairs) {
      const wrapRes = parseNaturalLanguageRequest(pair.wrapQuery);
      const unwrapRes = parseNaturalLanguageRequest(pair.unwrapQuery);

      assert.ok(wrapRes.isPossible && unwrapRes.isPossible);
      if (!wrapRes.isPossible || !unwrapRes.isPossible) continue;

      const wrappedText = executeStepsOnText(cleanDoc, wrapRes.steps);
      assert.equal(
        wrappedText,
        pair.expectedIntermediate,
        `Wrap step failed for "${pair.wrapQuery}"`
      );

      const unwrappedText = executeStepsOnText(wrappedText, unwrapRes.steps);
      assert.equal(
        unwrappedText,
        cleanDoc,
        `Round-trip Wrap -> Unwrap failed to restore original document for "${pair.wrapQuery}"`
      );
    }
  });
});
