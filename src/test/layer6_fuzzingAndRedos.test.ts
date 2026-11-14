import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { parseNaturalLanguageRequest } from '../compiler';
import { applyStepToText } from '../engine/boostEvaluator';
import { LEXICON_ENTRIES } from '../lexicon';
import { RegexStep } from '../types';
import { extractMatchDetails } from './helpers/testUtils';
import { GOLDEN_CORPUS_QUERIES } from './helpers/goldenCorpusData';

const ADVERSARIAL_INCOMPLETE_INPUTS: string[] = [
  'replace',
  'replace ',
  'replace \\w+ with',
  'replace \\w+ with ',
  'find "unclosed quote',
  "find 'unclosed single quote",
  'select `\\w+',
  'select ~\\d{2,4}',
  'select /\\w+',
  'find [a-z',
  'find [^0-9',
  'find (foo|bar',
  'find \\',
  'delete \\d{2,',
  'ensure',
  'ensure ',
  'ensure trailing',
  'ensure leading',
  'trim',
  'trim ',
  'wrap',
  'wrap words in',
  'put " around',
  'swap',
  'extract',
  'convert',
  'delete commas and then',
  'delete commas and then ',
  'find quote preceded by',
  'find quote not followed by'
];

const ZERO_WIDTH_EDGE_BUFFERS: string[] = [
  '',
  '\n',
  '\r\n',
  '\r\n\r\n',
  '   \t  \n  \t ',
  '   \t  \r\n  \t ',
  'line1\r\nline2\r\n'
];

describe('Layer 6: Keystroke Resilience, Zero-Width Termination & ReDoS Latency Guards', () => {
  it('6A: Incremental Keystroke Prefix Fuzzing (1..N character slices never throw or emit invalid RegExp)', () => {
    // Select 60 diverse queries across the Golden Corpus plus all adversarial incomplete inputs
    const sampleQueries = GOLDEN_CORPUS_QUERIES.filter((_, idx) => idx % 4 === 0).map(
      (tc) => tc.q
    );
    const allInputsToSlice = [...sampleQueries, ...ADVERSARIAL_INCOMPLETE_INPUTS];

    let totalPrefixesChecked = 0;

    for (const fullQuery of allInputsToSlice) {
      for (let len = 1; len <= fullQuery.length; len++) {
        const prefix = fullQuery.slice(0, len);
        if (!prefix.trim()) continue;
        totalPrefixesChecked++;

        let outcome: ReturnType<typeof parseNaturalLanguageRequest> | undefined;
        assert.doesNotThrow(() => {
          outcome = parseNaturalLanguageRequest(prefix);
        }, `Uncaught exception while typing prefix "${prefix}" of "${fullQuery}"`);

        if (outcome && outcome.isPossible) {
          for (const step of outcome.steps) {
            assert.doesNotThrow(
              () => new RegExp(step.find, step.flags),
              `Invalid RegExp /${step.find}/${step.flags} emitted on keystroke prefix "${prefix}" (from "${fullQuery}")`
            );
          }
        }
      }
    }

    assert.ok(
      totalPrefixesChecked >= 1500,
      `Expected at least 1,500 keystroke prefixes tested, ran ${totalPrefixesChecked}`
    );
  });

  it('6B: Zero-Width Match Termination & CRLF Integrity on Edge-Case Buffers', () => {
    const zeroWidthSteps: RegexStep[] = [
      { description: 'Zero-or-more wildcard', find: '.*', replace: 'X', flags: 'g' },
      { description: 'Zero-or-more whitespace', find: '\\s*', replace: '', flags: 'g' },
      { description: 'Line start anchor', find: '^', replace: '>', flags: 'gm' },
      { description: 'Line end anchor', find: '$', replace: ';', flags: 'gm' },
      {
        description: 'Trim leading/trailing whitespace',
        find: '^[ \\t]+|[ \\t]+$',
        replace: '',
        flags: 'gm'
      },
      {
        description: 'Ensure trailing semicolon',
        find: '^([^\\r\\n]*?\\S)(?<!;)([ \\t]*)$',
        replace: '$1;$2',
        flags: 'gm'
      },
      {
        description: 'Ensure leading comment',
        find: '^([ \\t]*)(?!//)(\\S[^\\r\\n]*)$',
        replace: '$1//$2',
        flags: 'gm'
      }
    ];

    for (const step of zeroWidthSteps) {
      for (const buffer of ZERO_WIDTH_EDGE_BUFFERS) {
        const start = performance.now();
        const details = extractMatchDetails(buffer, step);
        const applied = applyStepToText(buffer, step);
        const elapsed = performance.now() - start;

        assert.ok(
          elapsed < 50,
          `Zero-width pattern /${step.find}/${step.flags} hung (${elapsed.toFixed(1)}ms) on buffer ${JSON.stringify(buffer)}`
        );
        assert.ok(
          details.fullMatches.length < 100,
          `Zero-width pattern /${step.find}/ runaway loop (${details.fullMatches.length} matches)`
        );
        assert.equal(typeof applied.newText, 'string');
      }
    }

    // Specifically verify that zero-width line-end `$` on CRLF does not split `\r\n` endlessly
    const crlfSample = 'alpha\r\nbeta';
    const lineStartStep: RegexStep = {
      description: 'Line start',
      find: '^',
      replace: '#',
      flags: 'gm'
    };
    assert.equal(applyStepToText(crlfSample, lineStartStep).newText, '#alpha\r\n#beta');
  });

  it('6C: Adversarial ReDoS Latency Guard (< 50ms per pattern on 10,000-character pathological strings)', () => {
    const adversarialBuffers: { name: string; text: string }[] = [
      {
        name: '10k spaces without newline',
        text: ' '.repeat(10000)
      },
      {
        name: '4k alternating quotes and letters',
        text: '"a'.repeat(2000)
      },
      {
        name: '10k unclosed brackets',
        text: '[abc'.repeat(2500)
      },
      {
        name: '3k near-miss email characters',
        text: 'user.name_123'.repeat(200) + '@example'
      },
      {
        name: '10k words on a single line without semicolon',
        text: 'identifier '.repeat(900)
      }
    ];

    const criticalQueries = [
      "Add a semicolon to the end of every line that doesn't have one",
      'ensure leading //',
      'select quoted text',
      'select quote blocks',
      'select bracket blocks',
      'select bracket blocks without foo',
      'find emails',
      'find urls',
      'find phone numbers',
      'delete blank lines',
      'trim lines'
    ];

    for (const q of criticalQueries) {
      const res = parseNaturalLanguageRequest(q);
      assert.ok(res.isPossible);
      if (!res.isPossible) continue;

      const step = res.steps[0];
      for (const adv of adversarialBuffers) {
        const t0 = performance.now();
        extractMatchDetails(adv.text, step);
        const elapsedMs = performance.now() - t0;

        assert.ok(
          elapsedMs < 50,
          `ReDoS Latency Violation: query "${q}" (/${step.find}/${step.flags}) took ${elapsedMs.toFixed(2)}ms on [${adv.name}] (budget: 50ms)`
        );
      }
    }

    // Also audit every LEXICON_ENTRIES findPattern against the 10k word/space buffer
    const combinedStressText = 'word_123 '.repeat(500) + '   '.repeat(500);
    for (const entry of LEXICON_ENTRIES) {
      const step: RegexStep = {
        description: entry.label,
        find: entry.findPattern,
        flags: entry.needsMultiline ? 'gm' : 'g'
      };
      const t0 = performance.now();
      extractMatchDetails(combinedStressText, step);
      const elapsedMs = performance.now() - t0;

      assert.ok(
        elapsedMs < 50,
        `Lexicon ReDoS Violation: "${entry.id}" (/${entry.findPattern}/) took ${elapsedMs.toFixed(2)}ms`
      );
    }
  });
});
