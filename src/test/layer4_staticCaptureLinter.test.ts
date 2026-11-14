import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { LEXICON_ENTRIES } from '../lexicon';
import { resolveTargetClause } from '../resolvers';
import { parseNaturalLanguageRequest } from '../compiler';
import { maskQuotedLiterals } from '../grammar/tokens';
import {
  assertReplacementBackreferencesValid,
  lintRegexCaptureGroups
} from './helpers/testUtils';
import { GOLDEN_CORPUS_QUERIES } from './helpers/goldenCorpusData';

/**
 * Explicit allowlist of Lexicon IDs that intentionally define numbered capturing groups
 * for in-pattern backreferences (`\1`) or `$1`/`$2` replacement extraction.
 */
const ALLOWLISTED_CAPTURING_LEXICON_IDS = new Set<string>([
  'duplicate-lines',
  'duplicate-words',
  'non-empty-lines',
  'years',
  'markdown-links',
  'markdown-headers'
]);

describe('Layer 4: Static Structural Linting & Capture-Group Hygiene', () => {
  it('4A: Accurately distinguishes escaped parens, char classes, lookarounds, non-capturing, named, and numbered groups', () => {
    // Escaped parentheses and character-class parentheses must have 0 capture groups
    const escapedAndClass = lintRegexCaptureGroups('\\([^)\\r\\n]*\\)|[()]|[(a-z)]');
    assert.equal(escapedAndClass.numberedCaptureCount, 0);
    assert.equal(escapedAndClass.nonCapturingCount, 0);

    // Non-capturing groups and lookarounds must increment nonCapturingCount only
    const lookaroundsAndNonCap = lintRegexCaptureGroups(
      '(?<=\\$)(?:\\d+(?:\\.\\d{2})?)(?!\\s*[:=])(?<!-)'
    );
    assert.equal(lookaroundsAndNonCap.numberedCaptureCount, 0);
    assert.equal(lookaroundsAndNonCap.nonCapturingCount, 5);

    // Named capture groups must record their names and count toward numberedCaptureCount
    const named = lintRegexCaptureGroups(
      '(?<user>[a-zA-Z0-9._%+-]+)@(?<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})'
    );
    assert.equal(named.numberedCaptureCount, 2);
    assert.deepEqual(named.namedGroupNames, ['user', 'domain']);
    assert.deepEqual(named.duplicateNamedGroups, []);

    // Duplicate named capture groups must be flagged
    const dupNamed = lintRegexCaptureGroups('(?<id>\\d+)-(?<id>\\w+)');
    assert.deepEqual(dupNamed.duplicateNamedGroups, ['id']);

    // Numbered capture groups and backreferences
    const htmlBackref = lintRegexCaptureGroups('<([a-z]+)>(.*?)</\\1>');
    assert.equal(htmlBackref.numberedCaptureCount, 2);
    assert.deepEqual(htmlBackref.patternBackreferences, [1]);
  });

  it('4B: Enforces zero unintended numbered capture groups across all LEXICON_ENTRIES', () => {
    for (const entry of LEXICON_ENTRIES) {
      const findLint = lintRegexCaptureGroups(entry.findPattern);
      const unitLint = lintRegexCaptureGroups(entry.singleUnitPattern);

      assert.equal(
        findLint.duplicateNamedGroups.length,
        0,
        `Lexicon "${entry.id}" findPattern has duplicate named groups`
      );
      assert.equal(
        unitLint.duplicateNamedGroups.length,
        0,
        `Lexicon "${entry.id}" singleUnitPattern has duplicate named groups`
      );

      if (!ALLOWLISTED_CAPTURING_LEXICON_IDS.has(entry.id)) {
        assert.equal(
          findLint.numberedCaptureCount,
          0,
          `Lexicon entry "${entry.id}" findPattern /${entry.findPattern}/ contains ${findLint.numberedCaptureCount} unintended numbered capturing group(s). Use (?:...) instead so downstream $1/$2 indices are not shifted!`
        );
        assert.equal(
          unitLint.numberedCaptureCount,
          0,
          `Lexicon entry "${entry.id}" singleUnitPattern /${entry.singleUnitPattern}/ contains ${unitLint.numberedCaptureCount} unintended numbered capturing group(s). Use (?:...) instead!`
        );
      }
    }
  });

  it('4C: Enforces non-capturing grouping `(?:...)` across all Target Resolver Pipeline stages', () => {
    const nonCapturingResolverQueries = [
      // Stage 1: Masked token with quantifier
      '"hello"',
      '3 "ab"',
      // Stage 2: Inner delimiter (excluding HTML backreference tag case)
      'quoted text',
      'double-quoted text',
      'single-quoted text',
      'backticked text',
      'parenthesized text',
      'bracketed text',
      'braced text',
      'angle-bracketed text',
      'text between ( and )',
      // Stage 3: Negated char class
      'characters that are not digits or spaces',
      // Stage 4: Character range
      'uppercase letters from a to m',
      // Stage 5: Affix or line filter
      'words starting with pre',
      'words ending in ing',
      'words without ing',
      'lines starting with #',
      'lines containing ERROR',
      "lines that don't contain ERROR",
      // Stage 6: Delimited blocks (including quantified blocks & filtered blocks)
      'quote blocks',
      '2 bracket blocks',
      'brace blocks',
      'paren blocks',
      'blocks',
      'bracket blocks containing foo',
      'quote blocks without host',
      // Stage 7: Alternation & spelling variants
      'commas or semicolons',
      'foo or bar',
      '3 foo or bar',
      "the word 'color' whether American or British ('colour')",
      // Stage 8: Lexicon & direct regex with quantifiers
      '3 decimals',
      '2 emails',
      '3 \\w',
      '3 [a-f0-9]'
    ];

    for (const rawClause of nonCapturingResolverQueries) {
      const { masked, quotes } = maskQuotedLiterals(rawClause);
      const resolved = resolveTargetClause(masked, quotes);
      const lint = lintRegexCaptureGroups(resolved.pattern);

      assert.equal(
        lint.numberedCaptureCount,
        0,
        `Target resolver produced unintended numbered capture group(s) for "${rawClause}" -> /${resolved.pattern}/ (expected (?:...) non-capturing groups only)`
      );
    }
  });

  it('4D: Verifies backreference bounds (\\1, $1..$9, $<name>) and unique named groups across all Golden Corpus queries', () => {
    for (const tc of GOLDEN_CORPUS_QUERIES) {
      const res = parseNaturalLanguageRequest(tc.q);
      assert.ok(res.isPossible);
      if (!res.isPossible) continue;

      for (const step of res.steps) {
        assertReplacementBackreferencesValid(step);
      }
    }
  });
});
