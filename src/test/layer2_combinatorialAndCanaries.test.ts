import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseNaturalLanguageRequest } from '../compiler';
import { parseQueryClauses } from '../parser';
import { IntentMode } from '../types';
import { executeStepsOnText, extractMatchDetails } from './helpers/testUtils';

interface CombinatorialIntentSpec {
  buildQuery: (targetWithQuantifier: string, modifier: string) => string;
  expectedMode: IntentMode;
}

const MATRIX_INTENTS: CombinatorialIntentSpec[] = [
  {
    buildQuery: (t, mod) => `find ${t}${mod ? ` ${mod}` : ''}`,
    expectedMode: 'find'
  },
  {
    buildQuery: (t, mod) => `sel ${t}${mod ? ` ${mod}` : ''}`,
    expectedMode: 'find'
  },
  {
    buildQuery: (t, mod) => `delete ${t}${mod ? ` ${mod}` : ''}`,
    expectedMode: 'replace'
  },
  {
    buildQuery: (t, mod) => `rm ${t}${mod ? ` ${mod}` : ''}`,
    expectedMode: 'replace'
  },
  {
    buildQuery: (t, mod) => `replace ${t} with "#"${mod ? ` ${mod}` : ''}`,
    expectedMode: 'replace'
  },
  {
    buildQuery: (t, mod) => `wrap ${t} in parentheses${mod ? ` ${mod}` : ''}`,
    expectedMode: 'replace'
  }
];

interface CombinatorialTargetSpec {
  singularOrBase: string;
  plural: string;
  supportsQuantifier: boolean;
}

const MATRIX_TARGETS: CombinatorialTargetSpec[] = [
  { singularOrBase: 'word', plural: 'words', supportsQuantifier: true },
  { singularOrBase: 'number', plural: 'numbers', supportsQuantifier: true },
  { singularOrBase: 'digit', plural: 'digits', supportsQuantifier: true },
  { singularOrBase: 'letter', plural: 'letters', supportsQuantifier: true },
  { singularOrBase: 'uppercase letter', plural: 'caps', supportsQuantifier: true },
  { singularOrBase: 'lowercase letter', plural: 'lowercase', supportsQuantifier: true },
  { singularOrBase: 'tab', plural: 'tabs', supportsQuantifier: true },
  { singularOrBase: 'slash', plural: 'slashes', supportsQuantifier: true },
  { singularOrBase: 'quote', plural: 'quotes', supportsQuantifier: true },
  { singularOrBase: 'comma', plural: 'commas', supportsQuantifier: true },
  { singularOrBase: 'semicolon', plural: 'semicolons', supportsQuantifier: true },
  { singularOrBase: 'period', plural: 'periods', supportsQuantifier: true },
  { singularOrBase: 'underscore', plural: 'underscores', supportsQuantifier: true },
  { singularOrBase: 'hyphen', plural: 'hyphens', supportsQuantifier: true },
  { singularOrBase: 'vowel', plural: 'vowels', supportsQuantifier: true },
  { singularOrBase: 'consonant', plural: 'consonants', supportsQuantifier: true },
  { singularOrBase: 'hex color', plural: 'hex colors', supportsQuantifier: false },
  { singularOrBase: 'email', plural: 'emails', supportsQuantifier: false },
  { singularOrBase: 'url', plural: 'urls', supportsQuantifier: false },
  { singularOrBase: 'bracket block', plural: 'bracket blocks', supportsQuantifier: true },
  { singularOrBase: 'brace block', plural: 'brace blocks', supportsQuantifier: true },
  { singularOrBase: 'paren block', plural: 'paren blocks', supportsQuantifier: true },
  { singularOrBase: 'quote block', plural: 'quote blocks', supportsQuantifier: true },
  { singularOrBase: 'quoted text', plural: 'quoted text', supportsQuantifier: false },
  { singularOrBase: 'bracketed text', plural: 'bracketed text', supportsQuantifier: false },
  { singularOrBase: 'parenthesized text', plural: 'parenthesized text', supportsQuantifier: false },
  { singularOrBase: '\\w', plural: '\\w+', supportsQuantifier: true },
  { singularOrBase: '[a-f0-9]', plural: '[a-f0-9]+', supportsQuantifier: true }
];

const MATRIX_QUANTIFIERS = ['', '3', '2 to 4', 'at least 2', 'at most 5'];

const MATRIX_MODIFIERS = [
  '',
  'per line',
  'at the start of every line',
  'at the end of every line',
  'preceded by x',
  'not followed by :'
];

describe('Layer 2: Combinatorial Grammar Matrix & Disambiguation Canaries', () => {
  it('2A: Verifies 4 Universal Compiler Invariants across Combinatorial Grammar Matrix (Intents × Targets × Quantifiers × Modifiers)', () => {
    let combinationsTested = 0;

    for (const intent of MATRIX_INTENTS) {
      for (const target of MATRIX_TARGETS) {
        const quantifiersToUse = target.supportsQuantifier ? MATRIX_QUANTIFIERS : [''];

        for (const quant of quantifiersToUse) {
          const targetPhrase = quant ? `${quant} ${target.plural}` : target.plural;

          for (const modifier of MATRIX_MODIFIERS) {
            const query = intent.buildQuery(targetPhrase, modifier);
            combinationsTested++;

            // Invariant 1: Zero uncaught exceptions
            let res: ReturnType<typeof parseNaturalLanguageRequest> | undefined;
            assert.doesNotThrow(() => {
              res = parseNaturalLanguageRequest(query);
            }, `Uncaught exception for matrix query "${query}"`);

            assert.ok(res && res.isPossible, `Expected matrix query "${query}" to be possible`);
            if (!res || !res.isPossible) continue;

            // Invariant 2: Valid ECMAScript RegExp instantiation for every step
            for (const step of res.steps) {
              assert.doesNotThrow(
                () => new RegExp(step.find, step.flags),
                `Invalid RegExp /${step.find}/${step.flags} compiled from "${query}"`
              );
            }

            // Invariant 3: Zero silent literal fallbacks for known lexicon/structural targets
            const hasSilentLiteralFallback = res.featuresUsed.some((f) =>
              f.startsWith('Literal pattern (')
            );
            assert.equal(
              hasSilentLiteralFallback,
              false,
              `Silent literal fallback detected for structured query "${query}": features=${JSON.stringify(res.featuresUsed)}, find=/${res.steps[0].find}/`
            );

            // Invariant 4: Intent mode preservation under modifiers
            assert.equal(
              res.mode,
              intent.expectedMode,
              `Intent mode mutated under modifier for "${query}"`
            );
          }
        }
      }
    }

    assert.ok(
      combinationsTested >= 3000,
      `Expected at least 3,000 combinatorial matrix queries, ran ${combinationsTested}`
    );
  });

  it('2A-Promotion: Verifies "without one" / "that doesn\'t have one" intentionally promotes INSERT_ADD to ENSURE', () => {
    const unconditionalIr = parseQueryClauses('add a semicolon to the end of every line');
    const conditionalIr1 = parseQueryClauses(
      "add a semicolon to the end of every line that doesn't have one"
    );
    const conditionalIr2 = parseQueryClauses(
      'add a semicolon to the end of every line without one'
    );

    assert.equal(unconditionalIr.intent, 'INSERT_ADD');
    assert.equal(conditionalIr1.intent, 'ENSURE');
    assert.equal(conditionalIr2.intent, 'ENSURE');
  });

  it('2B-Canary 1: Disambiguates Inner Content vs. Full Delimited Blocks vs. Raw Delimiter Characters (Multi-Item Single Line)', () => {
    const quoteFixture = `const a = "foo", b = "bar", c = 'baz';`;

    // Inner content (EXCLUDING delimiters) — must never match the gap `", b = "` between strings
    for (const q of [
      'select quoted',
      'select quoted text',
      'select inside quotes',
      'select between quotes',
      'select text inside quotation marks'
    ]) {
      const res = parseNaturalLanguageRequest(q);
      assert.equal(res.isPossible, true);
      if (!res.isPossible) continue;
      const matches = extractMatchDetails(quoteFixture, res.steps[0]).fullMatches;
      assert.deepEqual(
        matches,
        ['foo', 'bar', 'baz'],
        `Inner quote canary failed for "${q}"`
      );
    }

    // Full delimited blocks (INCLUDING delimiters)
    for (const q of [
      'select strings',
      'select quotations',
      'select quote blocks',
      'select quotation mark blocks'
    ]) {
      const res = parseNaturalLanguageRequest(q);
      assert.equal(res.isPossible, true);
      if (!res.isPossible) continue;
      const matches = extractMatchDetails(quoteFixture, res.steps[0]).fullMatches;
      assert.deepEqual(
        matches,
        ['"foo"', '"bar"', "'baz'"],
        `Full quote block canary failed for "${q}"`
      );
    }

    // Raw delimiter characters ONLY
    const rawQuotesRes = parseNaturalLanguageRequest('select quotes');
    assert.equal(rawQuotesRes.isPossible, true);
    if (rawQuotesRes.isPossible) {
      const matches = extractMatchDetails(quoteFixture, rawQuotesRes.steps[0]).fullMatches;
      assert.deepEqual(matches, ['"', '"', '"', '"', "'", "'"]);
    }

    // Brackets, Braces, Parentheses, Angle Brackets, Backticks
    const multiDelimiterFixture = 'fn(arg1, arg2) + [item1, item2] + {k: 1} + <tag> + `code`';

    const delimiterTriads: {
      name: string;
      innerQuery: string;
      expectedInner: string[];
      blockQuery: string;
      expectedBlock: string[];
      rawQuery: string;
      expectedRaw: string[];
    }[] = [
      {
        name: 'Parentheses',
        innerQuery: 'select parenthesized text',
        expectedInner: ['arg1, arg2'],
        blockQuery: 'select paren blocks',
        expectedBlock: ['(arg1, arg2)'],
        rawQuery: 'select parentheses',
        expectedRaw: ['(', ')']
      },
      {
        name: 'Brackets',
        innerQuery: 'select bracketed text',
        expectedInner: ['item1, item2'],
        blockQuery: 'select bracket blocks',
        expectedBlock: ['[item1, item2]'],
        rawQuery: 'select brackets',
        expectedRaw: ['[', ']']
      },
      {
        name: 'Braces',
        innerQuery: 'select braced text',
        expectedInner: ['k: 1'],
        blockQuery: 'select brace blocks',
        expectedBlock: ['{k: 1}'],
        rawQuery: 'select braces',
        expectedRaw: ['{', '}']
      },
      {
        name: 'Angle Brackets',
        innerQuery: 'select angle-bracketed text',
        expectedInner: ['tag'],
        blockQuery: 'select angle bracket blocks',
        expectedBlock: ['<tag>'],
        rawQuery: 'select angle brackets',
        expectedRaw: ['<', '>']
      },
      {
        name: 'Backticks',
        innerQuery: 'select backticked text',
        expectedInner: ['code'],
        blockQuery: 'select backtick blocks',
        expectedBlock: ['`code`'],
        rawQuery: 'select backticks',
        expectedRaw: ['`', '`']
      }
    ];

    for (const triad of delimiterTriads) {
      const innerRes = parseNaturalLanguageRequest(triad.innerQuery);
      const blockRes = parseNaturalLanguageRequest(triad.blockQuery);
      const rawRes = parseNaturalLanguageRequest(triad.rawQuery);

      assert.ok(innerRes.isPossible && blockRes.isPossible && rawRes.isPossible);
      if (!innerRes.isPossible || !blockRes.isPossible || !rawRes.isPossible) continue;

      assert.deepEqual(
        extractMatchDetails(multiDelimiterFixture, innerRes.steps[0]).fullMatches,
        triad.expectedInner,
        `[${triad.name}] Inner match mismatch`
      );
      assert.deepEqual(
        extractMatchDetails(multiDelimiterFixture, blockRes.steps[0]).fullMatches,
        triad.expectedBlock,
        `[${triad.name}] Block match mismatch`
      );
      assert.deepEqual(
        extractMatchDetails(multiDelimiterFixture, rawRes.steps[0]).fullMatches,
        triad.expectedRaw,
        `[${triad.name}] Raw delimiter match mismatch`
      );
    }
  });

  it('2B-Canary 2: Disambiguates Lexicon Keywords vs. Quoted Literals vs. Whole-Word Phrases', () => {
    const sample = 'The word tabs and tabstops have\tactual\ttab characters.';

    // 1. Lexicon keyword `find tabs` -> `\t`
    const lexRes = parseNaturalLanguageRequest('find tabs');
    assert.ok(lexRes.isPossible);
    if (lexRes.isPossible) {
      assert.equal(lexRes.steps[0].find, '\\t');
      assert.deepEqual(extractMatchDetails(sample, lexRes.steps[0]).fullMatches, ['\t', '\t']);
    }

    // 2. Quoted literal `find "tabs"` -> `tabs`
    const quotedRes = parseNaturalLanguageRequest('find "tabs"');
    assert.ok(quotedRes.isPossible);
    if (quotedRes.isPossible) {
      assert.equal(quotedRes.steps[0].find, 'tabs');
      assert.deepEqual(extractMatchDetails(sample, quotedRes.steps[0]).fullMatches, [
        'tabs',
        'tabs'
      ]);
    }

    // 3. Explicit whole word `find the word "tabs"` -> `\btabs\b`
    const wordRes = parseNaturalLanguageRequest('find the word "tabs"');
    assert.ok(wordRes.isPossible);
    if (wordRes.isPossible) {
      assert.equal(wordRes.steps[0].find, '\\btabs\\b');
      assert.deepEqual(extractMatchDetails(sample, wordRes.steps[0]).fullMatches, ['tabs']);
    }
  });

  it('2B-Canary 3: Disambiguates Wildcard Character Shorthands (. and *) vs. Quoted Literal Punctuation', () => {
    const sample = 'abcd.*ef';

    const wildDot = parseNaturalLanguageRequest('find 4 .');
    const wildStar = parseNaturalLanguageRequest('find 4 *');
    const litDot = parseNaturalLanguageRequest('find "."');
    const litStar = parseNaturalLanguageRequest('find "*"');

    assert.ok(wildDot.isPossible && wildStar.isPossible && litDot.isPossible && litStar.isPossible);
    if (!wildDot.isPossible || !wildStar.isPossible || !litDot.isPossible || !litStar.isPossible) {
      return;
    }

    assert.equal(wildDot.steps[0].find, '.{4}');
    assert.equal(wildStar.steps[0].find, '.{4}');
    assert.equal(litDot.steps[0].find, '\\.');
    assert.equal(litStar.steps[0].find, '\\*');

    assert.deepEqual(extractMatchDetails(sample, wildDot.steps[0]).fullMatches, ['abcd', '.*ef']);
    assert.deepEqual(extractMatchDetails(sample, litDot.steps[0]).fullMatches, ['.']);
    assert.deepEqual(extractMatchDetails(sample, litStar.steps[0]).fullMatches, ['*']);
  });

  it('2B-Canary 4: Disambiguates Conditional (ENSURE) vs. Unconditional (INSERT_ADD) Line-Ending Insertion', () => {
    const fixture = 'const a = 1\nconst b = 2;';

    const unconditional = parseNaturalLanguageRequest('add ; to end per');
    const conditional = parseNaturalLanguageRequest('ensure trailing ;');

    assert.ok(unconditional.isPossible && conditional.isPossible);
    if (!unconditional.isPossible || !conditional.isPossible) return;

    assert.equal(
      executeStepsOnText(fixture, unconditional.steps),
      'const a = 1;\nconst b = 2;;',
      'Unconditional INSERT_ADD should append ; to every non-empty line'
    );
    assert.equal(
      executeStepsOnText(fixture, conditional.steps),
      'const a = 1;\nconst b = 2;',
      'Conditional ENSURE must never double-append ;; to lines already ending with ;'
    );
  });

  it('2B-Canary 5: Disambiguates Boolean Character Unions vs. Sequential Multi-Step Pipelines', () => {
    const fixture = 'a, b; c, d;';

    const unionRes = parseNaturalLanguageRequest('delete commas and semicolons');
    const pipelineRes = parseNaturalLanguageRequest('delete commas and then delete semicolons');

    assert.ok(unionRes.isPossible && pipelineRes.isPossible);
    if (!unionRes.isPossible || !pipelineRes.isPossible) return;

    // Union compiles to a single character class step `[,;]`
    assert.equal(unionRes.mode, 'replace');
    assert.equal(unionRes.steps.length, 1);
    assert.equal(unionRes.steps[0].find, '[,;]');

    // Sequential pipeline compiles to a 2-step multi-step pipeline
    assert.equal(pipelineRes.mode, 'multi-step');
    assert.equal(pipelineRes.steps.length, 2);
    assert.equal(pipelineRes.steps[0].find, ',');
    assert.equal(pipelineRes.steps[1].find, ';');

    // Both produce identical final output on the fixture
    assert.equal(executeStepsOnText(fixture, unionRes.steps), 'a b c d');
    assert.equal(executeStepsOnText(fixture, pipelineRes.steps), 'a b c d');
  });

  it('2B-Canary 6: Disambiguates Word Boundaries (\\b) vs. Non-Word / Inner-Word Boundaries (\\B)', () => {
    const innerPunctRes = parseNaturalLanguageRequest(
      'Match characters that are NOT alphanumeric, spaces, or underscores, but only when they appear in the middle of a word.'
    );
    const wholeWordRes = parseNaturalLanguageRequest(
      "Change all whole words that say 'cat' to 'dog'"
    );

    assert.ok(innerPunctRes.isPossible && wholeWordRes.isPossible);
    if (!innerPunctRes.isPossible || !wholeWordRes.isPossible) return;

    assert.equal(innerPunctRes.steps[0].find, '\\B[^\\w\\s]\\B');
    assert.equal(wholeWordRes.steps[0].find, '\\bcat\\b');

    const catSample = 'The cat sat on a category scatter.';
    assert.equal(
      executeStepsOnText(catSample, wholeWordRes.steps),
      'The dog sat on a category scatter.',
      'Word boundary \\bcat\\b must only replace standalone "cat"'
    );

    const innerWordSample = 'find "cat" in the middle of a word';
    const innerWordRes = parseNaturalLanguageRequest(innerWordSample);
    assert.ok(innerWordRes.isPossible);
    if (innerWordRes.isPossible) {
      assert.equal(innerWordRes.steps[0].find, '\\Bcat\\B');
      assert.deepEqual(
        extractMatchDetails(catSample, innerWordRes.steps[0]).fullMatches,
        ['cat'],
        'Non-word boundary \\Bcat\\B must only match "cat" inside "scatter"'
      );
    }
  });
});
