import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseNaturalLanguageRequest } from '../compiler';
import { parseQueryClauses } from '../parser';
import { ExecutionAction, IntentMode, MacroIntentType } from '../types';
import {
  executeStepsOnText,
  extractMatchDetails,
  runDualLineEndings
} from './helpers/testUtils';
import {
  GOLDEN_CORPUS_QUERIES,
  IMPOSSIBLE_CORPUS_QUERIES
} from './helpers/goldenCorpusData';

interface DeepGoldenCase {
  name: string;
  query: string;
  expectedMacroIntent: MacroIntentType;
  expectedMode: IntentMode;
  expectedPreferredAction?: ExecutionAction;
  expectedFlags: string;
  expectedStepCount: number;
  fixture: string;
  expectedMatches: string[];
  expectedGroup1?: (string | undefined)[];
  expectedNamedGroups?: Record<string, string>[];
  expectedReplacedText?: string;
}

const DEEP_GOLDEN_CASES: DeepGoldenCase[] = [
  {
    name: 'Conditional trailing semicolon insertion (ENSURE)',
    query: "Add a semicolon to the end of every line that doesn't have one",
    expectedMacroIntent: 'ENSURE',
    expectedMode: 'replace',
    expectedPreferredAction: 'replace-all',
    expectedFlags: 'gm',
    expectedStepCount: 1,
    fixture: [
      'const host = "localhost"',
      'const port = 8080;',
      'const protocol = "https"',
      'const timeout = 5000;'
    ].join('\n'),
    expectedMatches: ['const host = "localhost"', 'const protocol = "https"'],
    expectedGroup1: ['const host = "localhost"', 'const protocol = "https"'],
    expectedReplacedText: [
      'const host = "localhost";',
      'const port = 8080;',
      'const protocol = "https";',
      'const timeout = 5000;'
    ].join('\n')
  },
  {
    name: 'Inner quote selection (excluding delimiters on multi-string line)',
    query: 'select quoted text',
    expectedMacroIntent: 'FIND',
    expectedMode: 'find',
    expectedPreferredAction: 'select-matches',
    expectedFlags: 'gm',
    expectedStepCount: 1,
    fixture: 'const a = "localhost", b = "https", c = \'single\';\nconst d = "end";',
    expectedMatches: ['localhost', 'https', 'single', 'end']
  },
  {
    name: 'Full quote block selection (including delimiters on multi-string line)',
    query: 'select quotation mark blocks',
    expectedMacroIntent: 'FIND',
    expectedMode: 'find',
    expectedPreferredAction: 'select-matches',
    expectedFlags: 'g',
    expectedStepCount: 1,
    fixture: 'const a = "localhost", b = "https", c = \'single\';\nconst d = "end";',
    expectedMatches: ['"localhost"', '"https"', "'single'", '"end"']
  },
  {
    name: 'Named capture group email extraction',
    query: 'Extract the domain part of an email address into named variables.',
    expectedMacroIntent: 'EXTRACT_CAPTURE',
    expectedMode: 'replace',
    expectedFlags: 'g',
    expectedStepCount: 1,
    fixture: 'alice@example.com\nbob.smith@sub.domain.org',
    expectedMatches: ['alice@example.com', 'bob.smith@sub.domain.org'],
    expectedNamedGroups: [
      { user: 'alice', domain: 'example.com' },
      { user: 'bob.smith', domain: 'sub.domain.org' }
    ],
    expectedReplacedText: 'Domain: example.com, User: alice\nDomain: sub.domain.org, User: bob.smith'
  },
  {
    name: 'Multi-step SCREAMING_SNAKE_CASE to camelCase conversion',
    query: 'Convert all `SCREAMING_SNAKE_CASE` variable names into `camelCase`.',
    expectedMacroIntent: 'CASE_TRANSFORM',
    expectedMode: 'multi-step',
    expectedPreferredAction: 'replace-all',
    expectedFlags: 'g',
    expectedStepCount: 2,
    fixture: 'const MAX_RETRY_COUNT = 5;\nconst API_BASE_URL = "test";',
    expectedMatches: ['MAX_RETRY', 'API_BASE'],
    expectedGroup1: ['MAX', 'API'],
    expectedReplacedText: 'const maxRetryCount = 5;\nconst apiBaseUrl = "test";'
  },
  {
    name: 'Markdown link to HTML anchor transformation ($1 and $2)',
    query: 'Turn all Markdown links `[text](url)` into HTML links `<a href="url">text</a>`.',
    expectedMacroIntent: 'REPLACE',
    expectedMode: 'replace',
    expectedPreferredAction: 'replace-all',
    expectedFlags: 'g',
    expectedStepCount: 1,
    fixture: 'Visit [GitHub](https://github.com) or [Docs](https://docs.example.com).',
    expectedMatches: ['[GitHub](https://github.com)', '[Docs](https://docs.example.com)'],
    expectedGroup1: ['GitHub', 'Docs'],
    expectedReplacedText:
      'Visit <a href="https://github.com">GitHub</a> or <a href="https://docs.example.com">Docs</a>.'
  },
  {
    name: 'Date format conversion MM/DD/YYYY to YYYY-MM-DD',
    query: 'Convert MM/DD/YYYY dates to YYYY-MM-DD',
    expectedMacroIntent: 'REPLACE',
    expectedMode: 'replace',
    expectedPreferredAction: 'replace-all',
    expectedFlags: 'g',
    expectedStepCount: 1,
    fixture: 'Start: 04/15/2025\nEnd: 12/31/2026',
    expectedMatches: ['04/15/2025', '12/31/2026'],
    expectedGroup1: ['04', '12'],
    expectedReplacedText: 'Start: 2025-04-15\nEnd: 2026-12-31'
  },
  {
    name: 'Swap comma-separated columns per line',
    query: 'Swap first and last names in this comma-separated list.',
    expectedMacroIntent: 'SWAP_REORDER',
    expectedMode: 'replace',
    expectedPreferredAction: 'replace-all',
    expectedFlags: 'gm',
    expectedStepCount: 1,
    fixture: 'Lovelace, Ada\nTuring, Alan',
    expectedMatches: ['Lovelace, Ada', 'Turing, Alan'],
    expectedGroup1: ['Lovelace', 'Turing'],
    expectedReplacedText: 'Ada, Lovelace\nAlan, Turing'
  },
  {
    name: 'Positive lookbehind currency numbers',
    query:
      "Give me all numbers, but only if they have a dollar sign directly in front of them (don't include the dollar sign in the selection).",
    expectedMacroIntent: 'FIND',
    expectedMode: 'find',
    expectedFlags: 'g',
    expectedStepCount: 1,
    fixture: 'Item 42 costs $19.99 and 100 units cost $250.',
    expectedMatches: ['19.99', '250']
  },
  {
    name: 'Ensure leading comment prefix per line',
    query: 'ensure leading //',
    expectedMacroIntent: 'ENSURE',
    expectedMode: 'replace',
    expectedPreferredAction: 'replace-all',
    expectedFlags: 'gm',
    expectedStepCount: 1,
    fixture: 'const x = 1;\n// const y = 2;\n  const z = 3;',
    expectedMatches: ['const x = 1;', '  const z = 3;'],
    expectedGroup1: ['', '  '],
    expectedReplacedText: '//const x = 1;\n// const y = 2;\n  //const z = 3;'
  }
];

interface ParaphraseEquivalenceGroup {
  groupName: string;
  fixture: string;
  queries: string[];
}

const PARAPHRASE_EQUIVALENCE_GROUPS: ParaphraseEquivalenceGroup[] = [
  {
    groupName: 'Ensure trailing semicolons on lines missing one',
    fixture: 'const a = 1\nconst b = 2;\nconst c = 3',
    queries: [
      "Add a semicolon to the end of every line that doesn't have one",
      "add a semicolon at the end of each line that doesn't have one",
      'add ; at the end of each line without one',
      'add a semicolon at each line ending without one',
      'ensure trailing semicolons',
      'ensure trailing semicolon per line',
      'ensure trailing ;',
      'ensure every line ends with ;'
    ]
  },
  {
    groupName: 'Delete last 4 characters per line (shorthands & wildcards)',
    fixture: 'abcdef\n123456\nxyz789',
    queries: [
      'delete the last 4 characters of every line',
      'remove last 4 per',
      'rm last 4 per',
      'rm last 4 . per',
      'rm last 4 * per',
      'rm last 4 chars per'
    ]
  },
  {
    groupName: 'Replace slashes with tabs (conversational vs terse)',
    fixture: 'path/to/file\\name',
    queries: [
      'Replace slashes with tabs.',
      'replace slashes with tabs',
      'rep slashes with tabs'
    ]
  },
  {
    groupName: 'Select quoted text excluding quotation marks',
    fixture: 'const x = "alpha", y = \'beta\';',
    queries: [
      'select text inside quotation marks',
      'select between quotes',
      'select inside quotes',
      'select quoted',
      'select quoted text',
      'select quoted words'
    ]
  },
  {
    groupName: 'Select full string blocks including quotation marks',
    fixture: 'const x = "alpha", y = \'beta\';',
    queries: [
      'select strings',
      'select quotations',
      'select quote blocks',
      'select quotation blocks',
      'select quotation mark blocks'
    ]
  },
  {
    groupName: 'Positive lookbehind prepositions (preceded by / after / following / behind)',
    fixture: 'const host = "https"',
    queries: [
      'find quote preceded by s',
      'find quote after s',
      'find quote following s',
      'find quote behind s'
    ]
  },
  {
    groupName: 'Positive lookahead prepositions (followed by / before / preceding / in front of)',
    fixture: 'const s = "seconds"',
    queries: [
      'find quote followed by s',
      'find quote before s',
      'find quote preceding s',
      'find quote in front of s'
    ]
  },
  {
    groupName: 'Capitalize first letter of every line',
    fixture: 'hello world\nsecond line',
    queries: [
      'Capitalize the very first letter of every line.',
      'cap first per',
      'cap first letter per'
    ]
  }
];

describe('Layer 1: Dual-Assertion Golden Corpus & Paraphrase Equivalence', () => {
  it('1A: Compiles all 250+ Golden Corpus queries to exact expected IR and valid RegExp', () => {
    for (const tc of GOLDEN_CORPUS_QUERIES) {
      const res = parseNaturalLanguageRequest(tc.q);
      assert.equal(res.isPossible, true, `Expected "${tc.q}" to be possible`);
      if (!res.isPossible) continue;

      const step = res.steps[0];
      assert.equal(res.mode, tc.expectMode, `Mode mismatch for "${tc.q}"`);
      assert.equal(step.find, tc.expectFind, `Find pattern mismatch for "${tc.q}"`);
      if (tc.expectReplace !== undefined) {
        assert.equal(step.replace, tc.expectReplace, `Replace pattern mismatch for "${tc.q}"`);
      }

      // Must instantiate as a valid ECMAScript RegExp without throwing
      assert.doesNotThrow(
        () => new RegExp(step.find, step.flags),
        `Invalid RegExp for "${tc.q}": /${step.find}/${step.flags}`
      );
    }
  });

  it('1A-Impossible: Correctly rejects all 10 Chomsky Hierarchy impossible regex requests with explanations', () => {
    for (const iq of IMPOSSIBLE_CORPUS_QUERIES) {
      const res = parseNaturalLanguageRequest(iq);
      assert.equal(
        res.isPossible,
        false,
        `Expected impossible query "${iq}" to return isPossible=false`
      );
      if (!res.isPossible) {
        assert.ok(res.category.length > 0, `Missing category for "${iq}"`);
        assert.ok(res.reason.length > 0, `Missing reason for "${iq}"`);
        assert.ok(res.advice.length > 0, `Missing advice for "${iq}"`);
      }
    }
  });

  it('1B: Executes 4-Axis Deep Golden Corpus across both LF (\\n) and CRLF (\\r\\n) line endings', () => {
    for (const dgc of DEEP_GOLDEN_CASES) {
      const ir = parseQueryClauses(dgc.query);
      assert.equal(
        ir.intent,
        dgc.expectedMacroIntent,
        `[${dgc.name}] MacroIntentType mismatch`
      );

      const compiled = parseNaturalLanguageRequest(dgc.query);
      assert.equal(compiled.isPossible, true, `[${dgc.name}] Compiled result should be possible`);
      if (!compiled.isPossible) continue;

      // Axis 1: IR & Compiler Metadata
      assert.equal(compiled.mode, dgc.expectedMode, `[${dgc.name}] Mode mismatch`);
      if (dgc.expectedPreferredAction) {
        assert.equal(
          compiled.preferredAction,
          dgc.expectedPreferredAction,
          `[${dgc.name}] preferredAction mismatch`
        );
      }
      assert.equal(
        compiled.steps.length,
        dgc.expectedStepCount,
        `[${dgc.name}] step count mismatch`
      );
      assert.equal(
        compiled.steps[0].flags,
        dgc.expectedFlags,
        `[${dgc.name}] primary step flags mismatch`
      );

      // Run Axes 2, 3, and 4 across BOTH Unix LF (\n) and Windows CRLF (\r\n)
      runDualLineEndings(dgc.fixture, (text, eol, modeLabel) => {
        const details = extractMatchDetails(text, compiled.steps[0]);

        // Axis 2: Matched Span Extraction
        assert.deepEqual(
          details.fullMatches,
          dgc.expectedMatches,
          `[${dgc.name}][${modeLabel}] Matched spans mismatch`
        );

        // Axis 3: Capture Group Integrity ($1 & named groups)
        if (dgc.expectedGroup1) {
          assert.deepEqual(
            details.group1Matches,
            dgc.expectedGroup1,
            `[${dgc.name}][${modeLabel}] Capture group $1 mismatch`
          );
        }
        if (dgc.expectedNamedGroups) {
          assert.deepEqual(
            details.namedGroups,
            dgc.expectedNamedGroups,
            `[${dgc.name}][${modeLabel}] Named capture groups mismatch`
          );
        }

        // Axis 4: End-to-End Boost Evaluation
        if (dgc.expectedReplacedText !== undefined) {
          const expectedWithEol = dgc.expectedReplacedText
            .replace(/\r\n/g, '\n')
            .replace(/\n/g, eol);
          const actualOut = executeStepsOnText(text, compiled.steps);
          assert.equal(
            actualOut,
            expectedWithEol,
            `[${dgc.name}][${modeLabel}] End-to-end replacement output mismatch`
          );
        }
      });
    }
  });

  it('1C: Enforces Paraphrase Equivalence across conversational queries and power-user shorthands (LF & CRLF)', () => {
    for (const group of PARAPHRASE_EQUIVALENCE_GROUPS) {
      const baselineRes = parseNaturalLanguageRequest(group.queries[0]);
      assert.equal(
        baselineRes.isPossible,
        true,
        `[${group.groupName}] Baseline query "${group.queries[0]}" must be possible`
      );
      if (!baselineRes.isPossible) continue;

      for (const variantQuery of group.queries.slice(1)) {
        const variantRes = parseNaturalLanguageRequest(variantQuery);
        assert.equal(
          variantRes.isPossible,
          true,
          `[${group.groupName}] Variant "${variantQuery}" must be possible`
        );
        if (!variantRes.isPossible) continue;

        assert.equal(
          variantRes.mode,
          baselineRes.mode,
          `[${group.groupName}] Mode mismatch between "${group.queries[0]}" and "${variantQuery}"`
        );
        assert.equal(
          variantRes.steps[0].find,
          baselineRes.steps[0].find,
          `[${group.groupName}] Find pattern mismatch between "${group.queries[0]}" and "${variantQuery}"`
        );
        assert.equal(
          variantRes.steps[0].replace,
          baselineRes.steps[0].replace,
          `[${group.groupName}] Replace mismatch between "${group.queries[0]}" and "${variantQuery}"`
        );

        runDualLineEndings(group.fixture, (text, _eol, modeLabel) => {
          const baseMatches = extractMatchDetails(text, baselineRes.steps[0]).fullMatches;
          const varMatches = extractMatchDetails(text, variantRes.steps[0]).fullMatches;
          assert.deepEqual(
            varMatches,
            baseMatches,
            `[${group.groupName}][${modeLabel}] Match extraction diverged for "${variantQuery}"`
          );

          if (baselineRes.mode === 'replace' || baselineRes.mode === 'multi-step') {
            const baseOut = executeStepsOnText(text, baselineRes.steps);
            const varOut = executeStepsOnText(text, variantRes.steps);
            assert.equal(
              varOut,
              baseOut,
              `[${group.groupName}][${modeLabel}] Replacement output diverged for "${variantQuery}"`
            );
          }
        });
      }
    }
  });
});
