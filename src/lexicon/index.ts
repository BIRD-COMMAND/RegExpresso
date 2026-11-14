import {
  escapeCharClassLiteral,
  escapeRegexLiteral,
  parseNumberToken,
  WORD_NUMBERS
} from '../grammar/tokens';
import { BlockSpec, LexiconEntry, WrapperSpec } from './types';
import { LINES_AND_WHITESPACE_ENTRIES } from './entries/linesAndWhitespace';
import { SYMBOLS_AND_PUNCTUATION_ENTRIES } from './entries/symbolsAndPunctuation';
import { CHAR_CLASSES_AND_CASES_ENTRIES } from './entries/charClassesAndCases';
import { STRUCTURED_ENTITIES_ENTRIES } from './entries/structuredEntities';
import { resolveWrapperSpec } from './wrappers';
import { resolveBlockSpec as resolveBlockSpecInternal } from './blocks';
import { synthesizeTwoWordVariantPattern, US_UK_SPELLING_MAP } from './spellingVariants';

export {
  escapeCharClassLiteral,
  escapeRegexLiteral,
  parseNumberToken,
  WORD_NUMBERS,
  LexiconEntry,
  WrapperSpec,
  BlockSpec,
  resolveWrapperSpec,
  US_UK_SPELLING_MAP,
  synthesizeTwoWordVariantPattern
};

export const LEXICON_ENTRIES: LexiconEntry[] = [
  ...LINES_AND_WHITESPACE_ENTRIES,
  ...SYMBOLS_AND_PUNCTUATION_ENTRIES,
  ...CHAR_CLASSES_AND_CASES_ENTRIES,
  ...STRUCTURED_ENTITIES_ENTRIES
];

/**
 * Looks up a phrase in LEXICON_ENTRIES, preserving case-sensitivity for regex shorthand escapes
 * (\d vs \D, \w vs \W, \s vs \S).
 */
export function findLexiconEntry(phrase: string): LexiconEntry | null {
  const clean = phrase.trim();

  if (clean === '\\d') {
    return LEXICON_ENTRIES.find((e) => e.id === 'digits') ?? null;
  }
  if (clean === '\\D') {
    return LEXICON_ENTRIES.find((e) => e.id === 'non-digits') ?? null;
  }
  if (clean === '\\w') {
    return {
      id: 'word-char',
      label: 'word characters (\\w)',
      exactMatcher: /^\\w$/,
      findPattern: '\\w+',
      singleUnitPattern: '\\w',
      charClassChars: '\\w',
      supportsWordBoundary: true,
      features: ['Word character shorthand (\\w)']
    };
  }
  if (clean === '\\W') {
    return LEXICON_ENTRIES.find((e) => e.id === 'non-words') ?? null;
  }
  if (clean === '\\s') {
    return LEXICON_ENTRIES.find((e) => e.id === 'whitespace') ?? null;
  }
  if (clean === '\\S') {
    return LEXICON_ENTRIES.find((e) => e.id === 'non-whitespace') ?? null;
  }

  for (const entry of LEXICON_ENTRIES) {
    if (entry.exactMatcher.test(clean)) {
      return entry;
    }
  }
  return null;
}

export function resolveBlockSpec(rawDelimPhrase: string, quotes: string[]): BlockSpec | null {
  return resolveBlockSpecInternal(rawDelimPhrase, quotes, findLexiconEntry);
}
