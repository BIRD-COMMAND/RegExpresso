import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { findLexiconEntry, LEXICON_ENTRIES } from '../lexicon';
import {
  synthesizeTwoWordVariantPattern,
  US_UK_SPELLING_MAP
} from '../lexicon/spellingVariants';
import { checkImpossibleRequest, IMPOSSIBLE_RULES } from '../parser/impossibleGuard';
import { INTENT_MATCHERS } from '../parser/intentMatchers';
import { INTENT_HANDLERS, parseNaturalLanguageRequest } from '../compiler';
import { TARGET_RESOLVER_PIPELINE } from '../resolvers';
import { INNER_DELIMITER_RULES } from '../resolvers/insideDelimiterResolver';
import { MacroIntentType } from '../types';

/**
 * Canonical phrase map for every entry in `LEXICON_ENTRIES`.
 * Adding a new lexicon entry without registering its canonical phrase here
 * will immediately fail Test 5A with the unmapped entry ID.
 */
const CANONICAL_LEXICON_PHRASES: Record<string, string> = {
  // 1. Lines & Whitespace (14)
  'blank-lines': 'blank lines',
  'duplicate-lines': 'duplicate lines',
  'duplicate-words': 'duplicate words',
  'non-empty-lines': 'non-empty lines',
  'leading-and-trailing-whitespace': 'leading and trailing whitespace',
  'leading-whitespace': 'leading whitespace',
  'trailing-whitespace': 'trailing whitespace',
  'multiple-spaces': 'multiple spaces',
  tabs: 'tabs',
  newlines: 'newlines',
  'horizontal-whitespace': 'horizontal whitespace',
  spaces: 'spaces',
  whitespace: 'whitespace',
  'non-whitespace': 'non-whitespace',

  // 2. Symbols & Punctuation (42)
  'forward-slashes': 'forward slashes',
  backslashes: 'backslashes',
  slashes: 'slashes',
  'double-quotes': 'double quotes',
  'single-quotes': 'single quotes',
  backticks: 'backticks',
  'smart-quotes': 'smart quotes',
  'empty-strings': 'empty strings',
  'double-quoted-strings': 'double-quoted strings',
  'single-quoted-strings': 'single-quoted strings',
  strings: 'strings',
  quotes: 'quotes',
  periods: 'periods',
  commas: 'commas',
  semicolons: 'semicolons',
  colons: 'colons',
  underscores: 'underscores',
  hyphens: 'hyphens',
  parentheses: 'parentheses',
  'open-paren': 'opening parenthesis',
  'close-paren': 'closing parenthesis',
  brackets: 'brackets',
  'open-bracket': 'opening bracket',
  'close-bracket': 'closing bracket',
  braces: 'braces',
  'open-brace': 'opening curly brace',
  'close-brace': 'closing curly brace',
  'angle-brackets': 'angle brackets',
  'exclamation-marks': 'exclamation marks',
  'question-marks': 'question marks',
  asterisks: 'asterisks',
  'plus-signs': 'plus signs',
  'equals-signs': 'equals signs',
  hashes: 'hashes',
  'dollar-signs': 'dollar signs',
  'percent-signs': 'percent signs',
  ampersands: 'ampersands',
  pipes: 'pipes',
  tildes: 'tildes',
  carets: 'caret symbols',
  'at-signs': 'at signs',
  punctuation: 'punctuation',
  symbols: 'symbols',

  // 3. Character Classes & Cases (22)
  'uppercase-words': 'uppercase words',
  'lowercase-words': 'lowercase words',
  'capitalized-words': 'capitalized words',
  caps: 'caps',
  lowercase: 'lowercase',
  vowels: 'vowels',
  consonants: 'consonants',
  letters: 'letters',
  decimals: 'decimals',
  zeros: 'zeros',
  digits: 'digits',
  numbers: 'numbers',
  'non-digits': 'non-digits',
  hex: 'hexadecimal',
  alphanumeric: 'alphanumeric',
  words: 'words',
  'non-words': 'non-words',
  'screaming-snake-case': 'SCREAMING_SNAKE_CASE',
  'snake-case': 'snake_case',
  'camel-case': 'camelCase',
  'pascal-case': 'PascalCase',
  'kebab-case': 'kebab-case',

  // 4. Structured Entities (12)
  emails: 'emails',
  urls: 'urls',
  'ip-addresses': 'ip addresses',
  years: 'four-digit years',
  'iso-dates': 'iso dates',
  dates: 'dates',
  'phone-numbers': 'phone numbers',
  uuids: 'uuids',
  'html-tags': 'html tags',
  'markdown-links': 'markdown links',
  'markdown-headers': 'markdown headers',
  comments: 'comments',
  characters: 'characters'
};

/**
 * Canonical query map for every `MacroIntentType` in `INTENT_HANDLERS`.
 */
const CANONICAL_INTENT_QUERIES: Record<MacroIntentType, string> = {
  FIND: 'find words',
  DELETE: 'delete words',
  REPLACE: 'replace slashes with tabs',
  WRAP: 'wrap numbers in parentheses',
  INSERT_ADD: 'add ; to end per',
  ENSURE: 'ensure trailing ;',
  TRIM: 'trim lines',
  SWAP_REORDER: 'swap first and last names in this comma-separated list',
  CASE_TRANSFORM: 'capitalize the first letter of every line',
  EXTRACT_CAPTURE: 'extract the domain part of an email address into named variables'
};

/**
 * Canonical query probes for each rule in `IMPOSSIBLE_RULES`.
 */
const CANONICAL_IMPOSSIBLE_PROBES: string[] = [
  'Number each line sequentially: 1. , 2. , 3. , etc.',
  'Increase every price by 15%',
  'Match only numbers that are divisible by 7',
  'Find all code blocks where curly braces { ... } are properly balanced, no matter how deep they are nested',
  'Sort all names in this text file alphabetically',
  'Remove every duplicate line in this file, even if they are scattered pages apart and unsorted',
  'Change all dates to the day of the week they landed on',
  'Find every sentence written in the passive voice',
  'Reverse the letters of every word in this document'
];

/**
 * Canonical concise and container phrases for every rule in `INNER_DELIMITER_RULES`.
 */
const CANONICAL_INNER_DELIMITER_PROBES: {
  conciseLabel: string;
  concisePhrase: string;
  containerPhrase: string;
}[] = [
  {
    conciseLabel: 'quoted text (excluding quotation marks)',
    concisePhrase: 'quoted text',
    containerPhrase: 'text inside quotation marks'
  },
  {
    conciseLabel: 'double-quoted text (excluding quotation marks)',
    concisePhrase: 'double-quoted text',
    containerPhrase: 'text inside double quotes'
  },
  {
    conciseLabel: 'single-quoted text (excluding quotation marks)',
    concisePhrase: 'single-quoted text',
    containerPhrase: 'text inside single quotes'
  },
  {
    conciseLabel: 'backticked text (excluding backticks)',
    concisePhrase: 'backticked text',
    containerPhrase: 'text inside backticks'
  },
  {
    conciseLabel: 'parenthesized text (excluding parentheses)',
    concisePhrase: 'parenthesized text',
    containerPhrase: 'text inside parentheses'
  },
  {
    conciseLabel: 'bracketed text (excluding brackets)',
    concisePhrase: 'bracketed text',
    containerPhrase: 'text inside brackets'
  },
  {
    conciseLabel: 'braced text (excluding braces)',
    concisePhrase: 'braced text',
    containerPhrase: 'text inside braces'
  },
  {
    conciseLabel: 'angle-bracketed text (excluding angle brackets)',
    concisePhrase: 'angle-bracketed text',
    containerPhrase: 'text inside angle brackets'
  }
];

describe('Layer 5: Self-Policing Introspective Registry & Precedence Mutation Audits', () => {
  it('5A: Enforces 100% Zero-Unmapped-Entry Coverage across all Compiler Registries', () => {
    // 1. Every LEXICON_ENTRIES item must have a canonical phrase in CANONICAL_LEXICON_PHRASES
    for (const entry of LEXICON_ENTRIES) {
      assert.ok(
        entry.id in CANONICAL_LEXICON_PHRASES,
        `Unmapped LexiconEntry id "${entry.id}" in LEXICON_ENTRIES! Add it to CANONICAL_LEXICON_PHRASES in layer5_introspectiveAndMutation.test.ts.`
      );
    }
    assert.equal(
      Object.keys(CANONICAL_LEXICON_PHRASES).length,
      LEXICON_ENTRIES.length,
      'CANONICAL_LEXICON_PHRASES count must match LEXICON_ENTRIES.length'
    );

    // 2. Every INTENT_HANDLERS key must have a canonical query in CANONICAL_INTENT_QUERIES
    for (const intentKey of Object.keys(INTENT_HANDLERS) as MacroIntentType[]) {
      assert.ok(
        intentKey in CANONICAL_INTENT_QUERIES,
        `Unmapped MacroIntentType "${intentKey}" in INTENT_HANDLERS!`
      );
      const res = parseNaturalLanguageRequest(CANONICAL_INTENT_QUERIES[intentKey]);
      assert.equal(
        res.isPossible,
        true,
        `Canonical query for intent "${intentKey}" failed to compile`
      );
    }

    // 3. Every US_UK_SPELLING_MAP pair must synthesize a valid regex matching both variants
    for (const [key, [usWord, ukWord]] of Object.entries(US_UK_SPELLING_MAP)) {
      const synth = synthesizeTwoWordVariantPattern(usWord, ukWord, true);
      const regex = new RegExp(synth.pattern);
      assert.ok(
        regex.test(usWord),
        `US/UK variant regex /${synth.pattern}/ for "${key}" failed to match US "${usWord}"`
      );
      assert.ok(
        regex.test(ukWord),
        `US/UK variant regex /${synth.pattern}/ for "${key}" failed to match UK "${ukWord}"`
      );
    }

    // 4. Every IMPOSSIBLE_RULES entry must be triggered by its canonical probe
    assert.equal(
      CANONICAL_IMPOSSIBLE_PROBES.length,
      IMPOSSIBLE_RULES.length,
      'CANONICAL_IMPOSSIBLE_PROBES count must match IMPOSSIBLE_RULES.length'
    );
    for (let i = 0; i < IMPOSSIBLE_RULES.length; i++) {
      const rule = IMPOSSIBLE_RULES[i];
      const probe = CANONICAL_IMPOSSIBLE_PROBES[i];
      assert.equal(
        rule.test(probe),
        true,
        `IMPOSSIBLE_RULES[${i}] (${rule.result.category}) did not match probe "${probe}"`
      );
      const guardRes = checkImpossibleRequest(probe);
      assert.ok(guardRes && !guardRes.isPossible);
    }

    // 5. Every INNER_DELIMITER_RULES entry must match both its concise and container phrases
    assert.equal(
      CANONICAL_INNER_DELIMITER_PROBES.length,
      INNER_DELIMITER_RULES.length,
      'CANONICAL_INNER_DELIMITER_PROBES count must match INNER_DELIMITER_RULES.length'
    );
    for (let i = 0; i < INNER_DELIMITER_RULES.length; i++) {
      const rule = INNER_DELIMITER_RULES[i];
      const probe = CANONICAL_INNER_DELIMITER_PROBES[i];
      assert.equal(rule.conciseLabel, probe.conciseLabel);

      const conciseRes = parseNaturalLanguageRequest(`select ${probe.concisePhrase}`);
      const containerRes = parseNaturalLanguageRequest(`select ${probe.containerPhrase}`);
      assert.ok(conciseRes.isPossible && containerRes.isPossible);
      if (conciseRes.isPossible && containerRes.isPossible) {
        assert.equal(conciseRes.steps[0].find, rule.pattern);
        assert.equal(containerRes.steps[0].find, rule.pattern);
      }
    }
  });

  it('5B: Lexicon Order Shadowing Audit (Every LexiconEntry resolves to its own ID without earlier-entry shadowing)', () => {
    for (const entry of LEXICON_ENTRIES) {
      const phrase = CANONICAL_LEXICON_PHRASES[entry.id];
      const resolved = findLexiconEntry(phrase);
      assert.ok(
        resolved,
        `findLexiconEntry("${phrase}") returned null for entry "${entry.id}"`
      );
      assert.equal(
        resolved.id,
        entry.id,
        `Lexicon shadowing detected! Phrase "${phrase}" intended for "${entry.id}" was shadowed by earlier entry "${resolved.id}"`
      );
    }
  });

  it('5C: Bidirectional Capability Verification (Base Find, Quantified singleUnitPattern, and replaceLiteral)', () => {
    for (const entry of LEXICON_ENTRIES) {
      const phrase = CANONICAL_LEXICON_PHRASES[entry.id];

      // 1. Base Find: `find <phrase>`
      const findRes = parseNaturalLanguageRequest(`find ${phrase}`);
      assert.equal(
        findRes.isPossible,
        true,
        `Expected "find ${phrase}" (${entry.id}) to be possible`
      );
      if (findRes.isPossible) {
        assert.doesNotThrow(
          () => new RegExp(findRes.steps[0].find, findRes.steps[0].flags),
          `Invalid RegExp for "find ${phrase}" (${entry.id}): /${findRes.steps[0].find}/`
        );
      }

      // 2. Quantified Find: `find 3 <phrase>` (verifies singleUnitPattern is properly grouped when quantified)
      const quantRes = parseNaturalLanguageRequest(`find 3 ${phrase}`);
      assert.equal(
        quantRes.isPossible,
        true,
        `Expected quantified "find 3 ${phrase}" (${entry.id}) to be possible`
      );
      if (quantRes.isPossible) {
        assert.doesNotThrow(
          () => new RegExp(quantRes.steps[0].find, quantRes.steps[0].flags),
          `Invalid RegExp for quantified "find 3 ${phrase}" (${entry.id}): /${quantRes.steps[0].find}/`
        );
      }

      // 3. Replacement Capability: if `replaceLiteral` is defined, `replace words with <phrase>` must resolve it
      if (entry.replaceLiteral !== undefined && entry.id !== 'blank-lines' && entry.id !== 'duplicate-lines' && entry.id !== 'duplicate-words') {
        const repRes = parseNaturalLanguageRequest(`replace words with ${phrase}`);
        assert.equal(
          repRes.isPossible,
          true,
          `Expected "replace words with ${phrase}" (${entry.id}) to be possible`
        );
        if (repRes.isPossible) {
          assert.equal(
            repRes.steps[0].replace,
            entry.replaceLiteral,
            `Replacement literal mismatch for "replace words with ${phrase}" (${entry.id})`
          );
        }
      }
    }
  });

  it('5D: Precedence Mutation Audit (Swapping order-dependent rules in INTENT_MATCHERS & TARGET_RESOLVER_PIPELINE is caught)', () => {
    // 1. Audit INTENT_MATCHERS precedence boundaries
    const intentPrecedenceProbes: {
      indexA: number;
      indexB: number;
      description: string;
      probeQuery: string;
    }[] = [
      {
        // matchCaretPlacementIntent (0) vs matchInsertAddIntent (5)
        indexA: 0,
        indexB: 5,
        description: 'matchCaretPlacementIntent must precede matchInsertAddIntent ("add carets before...")',
        probeQuery: 'add carets before numbers'
      },
      {
        // matchCaretPlacementIntent (0) vs matchInsertAddIntent (5) for end-of-line
        indexA: 0,
        indexB: 5,
        description: 'matchCaretPlacementIntent must precede matchInsertAddIntent ("put carets at the end of...")',
        probeQuery: 'put carets at the end of words'
      },
      {
        // matchCaretPlacementIntent (0) vs matchInsertAddIntent (5) for start-of-line
        indexA: 0,
        indexB: 5,
        description: 'matchCaretPlacementIntent must precede matchInsertAddIntent ("add carets at the start of...")',
        probeQuery: 'add carets at the start of every line'
      }
    ];

    for (const audit of intentPrecedenceProbes) {
      const baseline = parseNaturalLanguageRequest(audit.probeQuery);
      assert.equal(baseline.isPossible, true);
      if (!baseline.isPossible) continue;

      // Temporarily swap indexA and indexB in INTENT_MATCHERS
      const temp = INTENT_MATCHERS[audit.indexA];
      INTENT_MATCHERS[audit.indexA] = INTENT_MATCHERS[audit.indexB];
      INTENT_MATCHERS[audit.indexB] = temp;

      try {
        const mutated = parseNaturalLanguageRequest(audit.probeQuery);
        const diverged =
          !mutated.isPossible ||
          mutated.mode !== baseline.mode ||
          mutated.preferredAction !== baseline.preferredAction ||
          mutated.steps[0].find !== baseline.steps[0].find ||
          mutated.steps[0].replace !== baseline.steps[0].replace;

        assert.equal(
          diverged,
          true,
          `Precedence mutation audit failed: swapping INTENT_MATCHERS[${audit.indexA}] and [${audit.indexB}] (${audit.description}) was not caught by probe "${audit.probeQuery}"`
        );
      } finally {
        // Always restore original order
        INTENT_MATCHERS[audit.indexB] = INTENT_MATCHERS[audit.indexA];
        INTENT_MATCHERS[audit.indexA] = temp;
      }
    }

    // 2. Audit TARGET_RESOLVER_PIPELINE precedence boundaries
    const resolverPrecedenceProbes: {
      indexA: number;
      indexB: number;
      description: string;
      probeQuery: string;
    }[] = [
      {
        // resolveInsideDelimiterStage (1) vs resolveLexiconOrDirectRegexStage (7)
        indexA: 1,
        indexB: 7,
        description: 'resolveInsideDelimiterStage must precede resolveLexiconOrDirectRegexStage',
        probeQuery: 'select text inside quotation marks'
      },
      {
        // resolveNegatedCharClassStage (2) vs resolveLexiconOrDirectRegexStage (7)
        indexA: 2,
        indexB: 7,
        description: 'resolveNegatedCharClassStage must precede resolveLexiconOrDirectRegexStage',
        probeQuery: "find characters that aren't digits"
      },
      {
        // resolveCharacterRangeStage (3) vs resolveLexiconOrDirectRegexStage (7)
        indexA: 3,
        indexB: 7,
        description: 'resolveCharacterRangeStage must precede resolveLexiconOrDirectRegexStage',
        probeQuery: 'find uppercase letters from a-m'
      },
      {
        // resolveAffixOrLineFilterStage (4) vs resolveLexiconOrDirectRegexStage (7)
        indexA: 4,
        indexB: 7,
        description: 'resolveAffixOrLineFilterStage must precede resolveLexiconOrDirectRegexStage',
        probeQuery: 'find words starting with pre'
      },
      {
        // resolveDelimitedBlockStage (5) vs resolveLexiconOrDirectRegexStage (7)
        indexA: 5,
        indexB: 7,
        description: 'resolveDelimitedBlockStage must precede resolveLexiconOrDirectRegexStage',
        probeQuery: 'select bracket blocks'
      },
      {
        // resolveAlternationOrVariantStage (6) vs resolveLexiconOrDirectRegexStage (7)
        indexA: 6,
        indexB: 7,
        description: 'resolveAlternationOrVariantStage must precede resolveLexiconOrDirectRegexStage',
        probeQuery: 'delete commas and semicolons'
      }
    ];

    for (const audit of resolverPrecedenceProbes) {
      const baseline = parseNaturalLanguageRequest(audit.probeQuery);
      assert.equal(baseline.isPossible, true);
      if (!baseline.isPossible) continue;

      const temp = TARGET_RESOLVER_PIPELINE[audit.indexA];
      TARGET_RESOLVER_PIPELINE[audit.indexA] = TARGET_RESOLVER_PIPELINE[audit.indexB];
      TARGET_RESOLVER_PIPELINE[audit.indexB] = temp;

      try {
        const mutated = parseNaturalLanguageRequest(audit.probeQuery);
        const diverged =
          !mutated.isPossible ||
          mutated.steps[0].find !== baseline.steps[0].find ||
          mutated.steps[0].replace !== baseline.steps[0].replace;

        assert.equal(
          diverged,
          true,
          `Precedence mutation audit failed: swapping TARGET_RESOLVER_PIPELINE[${audit.indexA}] and [${audit.indexB}] (${audit.description}) was not caught by probe "${audit.probeQuery}"`
        );
      } finally {
        TARGET_RESOLVER_PIPELINE[audit.indexB] = TARGET_RESOLVER_PIPELINE[audit.indexA];
        TARGET_RESOLVER_PIPELINE[audit.indexA] = temp;
      }
    }
  });
});
