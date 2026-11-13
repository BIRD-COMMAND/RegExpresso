import {
  escapeCharClassLiteral,
  escapeRegexLiteral,
  LEXICON_ENTRIES,
  LexiconEntry,
  parseNumberToken,
  synthesizeTwoWordVariantPattern,
  US_UK_SPELLING_MAP
} from './lexicon';
import { unmaskQuotes } from './clauseParser';

export interface ResolvedTarget {
  pattern: string;
  label: string;
  features: string[];
  needsMultiline: boolean;
  needsCaseInsensitive: boolean;
  defaultReplace?: string;
  lexiconId?: string;
  isWholeLine?: boolean;
  hasCaptureGroups?: boolean;
}

interface QuantifierExtract {
  quantifier: string;
  feature?: string;
  remainingText: string;
  isSingleUnitRequest: boolean;
}

/**
 * Extracts explicit quantifiers from a target clause:
 * - "three to five digits" -> {3,5}
 * - "at least 2 spaces" -> {2,}
 * - "at most 4 letters" -> {1,4}
 * - "exactly 3 digits" / "3 digits" -> {3}
 * - "one or more" -> +
 * - "zero or more" -> *
 * - "optional" / "zero or one" -> ?
 */
function extractQuantifier(text: string): QuantifierExtract {
  let working = text.trim();

  // Strip introductory filler like "any place where someone typed", "any place where there are"
  working = working
    .replace(
      /^(?:any\s+place\s+where\s+(?:someone\s+typed|there\s+(?:is|are))|places?\s+where\s+(?:someone\s+typed|there\s+(?:is|are)))\s+/i,
      ''
    )
    .trim();

  // Strip trailing "in a row" / "consecutively" unless preceded by "twice"
  if (!/\btwice\s+in\s+a\s+row\b/i.test(working)) {
    working = working.replace(/\s+(?:in\s+a\s+row|consecutively)\b/gi, '').trim();
  }

  const numTokenPattern = '(?:\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)';

  // 1. Range quantifier: "three to five", "3 to 5", "between 3 and 5", "3-5"
  const rangeRegex = new RegExp(
    `^(?:between\\s+)?(${numTokenPattern})\\s*(?:to|through|and|-)\\s*(${numTokenPattern})\\s+(.+)$`,
    'i'
  );
  const rangeMatch = working.match(rangeRegex);
  if (rangeMatch) {
    const min = parseNumberToken(rangeMatch[1]);
    const max = parseNumberToken(rangeMatch[2]);
    if (min !== null && max !== null) {
      const q = `{${min},${max}}`;
      return {
        quantifier: q,
        feature: `Range quantifier (${q})`,
        remainingText: rangeMatch[3].trim(),
        isSingleUnitRequest: false
      };
    }
  }

  // 2. Lower-bound quantifier: "at least N", "N or more", "minimum of N"
  const atLeastRegex = new RegExp(
    `^(?:at\\s+least\\s+(${numTokenPattern})|minimum\\s+(?:of\\s+)?(${numTokenPattern})|(${numTokenPattern})\\s+or\\s+more)\\s+(.+)$`,
    'i'
  );
  const atLeastMatch = working.match(atLeastRegex);
  if (atLeastMatch) {
    const n = parseNumberToken(atLeastMatch[1] ?? atLeastMatch[2] ?? atLeastMatch[3]);
    if (n !== null) {
      const q = n === 1 ? '+' : `{${n},}`;
      return {
        quantifier: q,
        feature: n === 1 ? 'One-or-more quantifier (+)' : `Lower-bound quantifier (${q})`,
        remainingText: atLeastMatch[4].trim(),
        isSingleUnitRequest: false
      };
    }
  }

  // 3. Upper-bound quantifier: "at most N", "up to N", "no more than N"
  const atMostRegex = new RegExp(
    `^(?:at\\s+most|up\\s+to|no\\s+more\\s+than)\\s+(${numTokenPattern})\\s+(.+)$`,
    'i'
  );
  const atMostMatch = working.match(atMostRegex);
  if (atMostMatch) {
    const max = parseNumberToken(atMostMatch[1]);
    if (max !== null && max >= 1) {
      const q = `{1,${max}}`;
      return {
        quantifier: q,
        feature: `Range quantifier (${q})`,
        remainingText: atMostMatch[2].trim(),
        isSingleUnitRequest: false
      };
    }
  }

  // 4. Zero or more / One or more / Optional
  if (/^zero\s+or\s+more\s+(.+)$/i.test(working)) {
    const m = working.match(/^zero\s+or\s+more\s+(.+)$/i)!;
    return {
      quantifier: '*',
      feature: 'Zero-or-more quantifier (*)',
      remainingText: m[1].trim(),
      isSingleUnitRequest: false
    };
  }
  if (/^one\s+or\s+more\s+(.+)$/i.test(working)) {
    const m = working.match(/^one\s+or\s+more\s+(.+)$/i)!;
    return {
      quantifier: '+',
      feature: 'One-or-more quantifier (+)',
      remainingText: m[1].trim(),
      isSingleUnitRequest: false
    };
  }
  if (/^(?:optional|zero\s+or\s+one)\s+(.+)$/i.test(working)) {
    const m = working.match(/^(?:optional|zero\s+or\s+one)\s+(.+)$/i)!;
    return {
      quantifier: '?',
      feature: 'Zero-or-one quantifier (?)',
      remainingText: m[1].trim(),
      isSingleUnitRequest: false
    };
  }

  // 5. Exact count: "(exactly) N <target>" (excluding "four-digit years" which is a lexicon concept)
  if (!/^(?:four|4)[-\s]digit\s+years?\b/i.test(working)) {
    const exactRegex = new RegExp(`^(?:exactly\\s+)?(${numTokenPattern})[-\\s]+(.+)$`, 'i');
    const exactMatch = working.match(exactRegex);
    if (exactMatch) {
      const count = parseNumberToken(exactMatch[1]);
      const rest = exactMatch[2].trim();
      if (count !== null && count > 1) {
        // Check for "N-letter words" or "N-character words"
        const nLetterWord = rest.match(/^(?:letter|character|char)\s+words?$/i);
        if (nLetterWord) {
          return {
            quantifier: `{${count}}`,
            feature: `Exact quantifier ({${count}})`,
            remainingText: 'letters_as_word',
            isSingleUnitRequest: false
          };
        }
        const nDigitNum = rest.match(/^digit\s+numbers?$/i);
        if (nDigitNum) {
          return {
            quantifier: `{${count}}`,
            feature: `Exact quantifier ({${count}})`,
            remainingText: 'digits_as_word',
            isSingleUnitRequest: false
          };
        }
        const q = `{${count}}`;
        return {
          quantifier: q,
          feature: `Exact quantifier (${q})`,
          remainingText: rest,
          isSingleUnitRequest: false
        };
      } else if (count === 1 && /^exactly\s+/i.test(working)) {
        return {
          quantifier: '',
          remainingText: rest,
          isSingleUnitRequest: true
        };
      }
    }
  }

  return {
    quantifier: '',
    remainingText: working,
    isSingleUnitRequest: /^(?:a\s+single|single|each\s+individual)\s+/i.test(working)
  };
}

const PER_LINE_SUFFIX_REGEX =
  /\s+(?:all|per|per[-\s]lines?|(?:of|on|in|per|for)\s+(?:every\s+|each\s+|all\s+|a\s+|the\s+)?lines?)$/i;

/**
 * Strips trailing per-line scope modifiers ("per", "per line", "per-line", "on every line", "of each line")
 * if stripping them leaves a non-empty base phrase.
 */
export function extractPerLineSuffix(text: string): { cleaned: string; hasPerLine: boolean } {
  const match = text.match(PER_LINE_SUFFIX_REGEX);
  if (match && match.index !== undefined) {
    const cleaned = text.slice(0, match.index).trim();
    if (cleaned.length > 0) {
      return { cleaned, hasPerLine: true };
    }
  }
  return { cleaned: text.trim(), hasPerLine: false };
}

/**
 * Strips leading determiners/classifiers ("all", "every", "the", "a", "an", "whole words that say", etc.)
 * ONLY when stripping them leaves a non-empty remainder.
 */
function stripDeterminersAndClassifiers(
  input: string
): {
  cleaned: string;
  wholeWordHint: boolean;
  startOfLineHint: boolean;
  endOfLineHint: boolean;
} {
  let s = input.trim();
  let wholeWordHint = false;
  let startOfLineHint = false;
  let endOfLineHint = false;

  // Detect trailing "without letters attached" / "as a whole word" / "standalone"
  if (/\s+(?:without\s+letters?\s+attached|as\s+(?:a\s+)?whole\s+words?|standalone)\b/i.test(s)) {
    wholeWordHint = true;
    s = s.replace(/\s+(?:without\s+letters?\s+attached|as\s+(?:a\s+)?whole\s+words?|standalone)\b/gi, '').trim();
  }

  // Detect trailing "in this text / file / document / list / column / string"
  if (/\s+in\s+(?:this|the)\s+(?:text|file|document|string|input|code|list|editor)$/i.test(s)) {
    s = s.replace(/\s+in\s+(?:this|the)\s+(?:text|file|document|string|input|code|list|editor)$/i, '').trim();
  }

  // Detect trailing "at (the) start/beginning (of every line | per | per line)"
  const startLineRegex =
    /\s+at\s+(?:the\s+)?(?:start|beginning)(?:\s+(?:per|per[-\s]lines?|(?:of|on|in|for)\s+(?:every\s+|each\s+|all\s+|a\s+|the\s+)?lines?))?$/i;
  if (startLineRegex.test(s)) {
    startOfLineHint = true;
    s = s.replace(startLineRegex, '').trim();
  }

  // Detect trailing "at (the) end (of every line | per | per line)"
  const endLineRegex =
    /\s+at\s+(?:the\s+)?end(?:\s+(?:per|per[-\s]lines?|(?:of|on|in|for)\s+(?:every\s+|each\s+|all\s+|a\s+|the\s+)?lines?))?$/i;
  if (endLineRegex.test(s)) {
    endOfLineHint = true;
    s = s.replace(endLineRegex, '').trim();
  }

  // Iteratively strip multi-word prefixes if remainder is non-empty
  const prefixPatterns: { regex: RegExp; setsWholeWord?: boolean }[] = [
    { regex: /^(?:all\s+|every\s+|each\s+|any\s+)?(?:whole|exact|complete|full|standalone)\s+words?\s+(?:that\s+(?:say|are|match|equal)|saying|matching|called|named)\s+/i, setsWholeWord: true },
    { regex: /^(?:all\s+|every\s+|each\s+|any\s+)?words?\s+(?:that\s+(?:say|are|match|equal)|saying|matching|called|named)\s+/i, setsWholeWord: true },
    { regex: /^(?:all\s+|every\s+|each\s+|any\s+)?(?:the\s+)?(?:whole|exact|complete|standalone)\s+words?\s+/i, setsWholeWord: true },
    { regex: /^(?:every|each|all|any)\s+(?:single\s+)?(?:instances?|occurrences?|places?|matches?)\s+of\s+/i, setsWholeWord: true },
    { regex: /^(?:instances?|occurrences?)\s+of\s+/i, setsWholeWord: true },
    { regex: /^(?:all\s+of\s+the|all\s+the|all|every|each|any)\s+/i },
    { regex: /^(?:the\s+)?(?:exact\s+|literal\s+)?(?:word)\s+(?!that(?:'?s|\s+(?:is|are|isn'?t|aren'?t|starts?|beg[ai]ns?|ends?|contains?|ha(?:ve|s)|do(?:es)?|don'?t|doesn'?t))\b|which\b|typed\b|repeated\b|starting\b|beginning\b|ending\b|containing\b|with\b|without\b|lacking\b|omitting\b|in\b|inside\b|between\b|within\b)/i, setsWholeWord: true },
    { regex: /^(?:the\s+)?(?:exact\s+|literal\s+)?(?:string|text|phrase|token|character|char|letter|symbol|value|pattern|regex|regular\s+expression)\s+(?!that(?:'?s|\s+(?:is|are|isn'?t|aren'?t|starts?|beg[ai]ns?|ends?|contains?|ha(?:ve|s)|do(?:es)?|don'?t|doesn'?t))\b|which\b|starting\b|beginning\b|ending\b|containing\b|with\b|without\b|lacking\b|omitting\b|not\b|except\b|other\b|excluding\b|from\b|inside\b|within\b|between\b|in\b|after\b|before\b|enclosed\b|wrapped\b|surrounded\b)/i },
    { regex: /^(?:the|a|an|some)\s+/i }
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const p of prefixPatterns) {
      const m = s.match(p.regex);
      if (m) {
        const remainder = s.slice(m[0].length).trim();
        if (remainder.length > 0) {
          s = remainder;
          if (p.setsWholeWord) wholeWordHint = true;
          changed = true;
          break;
        }
      }
    }
  }

  // Detect leading positional keywords: "leading <X>" or "trailing <Y>"
  // (excluding dedicated lexicon entries like "leading and trailing whitespace", "leading whitespace", "trailing spaces")
  if (/^(?:leading|trailing)\s+/i.test(s)) {
    const perExtracted = extractPerLineSuffix(s);
    if (perExtracted.hasPerLine) {
      s = perExtracted.cleaned;
    }
  }

  const leadingModMatch = s.match(
    /^leading\s+(?!and\s+trailing\b|whitespace\b|white[\s_]+space\b|spaces?\b|indentation\b|indent\b)(.+)$/i
  );
  if (leadingModMatch) {
    startOfLineHint = true;
    s = leadingModMatch[1].trim();
  }

  const trailingModMatch = s.match(
    /^trailing\s+(?!whitespace\b|white[\s_]+space\b|spaces?\b)(.+)$/i
  );
  if (trailingModMatch) {
    endOfLineHint = true;
    s = trailingModMatch[1].trim();
  }

  return { cleaned: s, wholeWordHint, startOfLineHint, endOfLineHint };
}

/**
 * Looks up a phrase in LEXICON_ENTRIES.
 */
export function findLexiconEntry(phrase: string): LexiconEntry | null {
  const clean = phrase.trim();
  // Handle case-sensitive regex shorthand escapes before case-insensitive lexicon matchers
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

/**
 * Resolves a negated character class description, e.g.:
 * "characters that are NOT alphanumeric, spaces, or underscores" -> [^\w\s]
 * "anything except digits" -> [^\d]+
 */
function tryResolveNegatedCharClass(
  phrase: string,
  quotes: string[],
  quantifier: string
): ResolvedTarget | null {
  const negMatch = phrase.match(
    /^(?:(?:characters?|chars?|anything|everything|symbols?|tokens?)\s+(?:(?:that|which)\s+(?:(?:are|is)\s+not|(?:aren'?t|isn'?t))\s+|(?:(?:that|which)\s+(?:are|is)\s+)?(?:not|except(?:\s+for)?|other\s+than|excluding|besides)\s+)|(?:not|except(?:\s+for)?|other\s+than|excluding)\s+)(.+)$/i
  );
  if (!negMatch) return null;

  const listStr = unmaskQuotes(negMatch[1].trim(), quotes);
  const parts = listStr
    .split(/\s*(?:,|\bor\b|\band\b|\bnor\b)\s*/i)
    .map((p) => p.replace(/^(?:a|an|the|any)\s+/i, '').trim())
    .filter(Boolean);

  if (parts.length === 0) return null;

  let hasAlnum = false;
  let hasUnderscore = false;
  let hasSpace = false;
  const charSets: string[] = [];

  for (const part of parts) {
    if (/^(?:alphanumeric(?:s|[\s_]+chars?|[\s_]+characters?)?|letters?[\s_]+and[\s_]+numbers?)$/i.test(part)) {
      hasAlnum = true;
      continue;
    }
    if (/^underscores?$/i.test(part)) {
      hasUnderscore = true;
      continue;
    }
    if (/^(?:spaces?|whitespace|white[\s_]+space)$/i.test(part)) {
      hasSpace = true;
      continue;
    }

    const entry = findLexiconEntry(part);
    if (entry?.charClassChars) {
      charSets.push(entry.charClassChars);
    } else if (part.length === 1) {
      charSets.push(escapeCharClassLiteral(part));
    } else {
      return null;
    }
  }

  let combined = '';
  if (hasAlnum && hasUnderscore) {
    combined += '\\w';
  } else {
    if (hasAlnum) combined += 'a-zA-Z0-9';
    if (hasUnderscore) combined += '_';
  }
  if (hasSpace) {
    combined += '\\s';
  }
  combined += charSets.join('');

  if (!combined) return null;

  const isPluralAnything = /^(?:anything|everything)\b/i.test(phrase);
  const finalQuant = quantifier || (isPluralAnything ? '+' : '');

  return {
    pattern: `[^${combined}]${finalQuant}`,
    label: `characters not in [${combined}]`,
    features: [`Negated character class ([^${combined}])`],
    needsMultiline: false,
    needsCaseInsensitive: false
  };
}

/**
 * Resolves explicit character ranges like "letters from a to m", "digits between 1 and 5".
 */
function tryResolveCharacterRange(
  phrase: string,
  quantifier: string
): ResolvedTarget | null {
  const rangeMatch = phrase.match(
    /^(?:(upper[-\s_]?case|lower[-\s_]?case|capitals?|caps|small)\s+)?(?:letters?|characters?|chars?|digits?|numbers?)\s+(?:from\s+|between\s+)?([a-zA-Z0-9])(?:\s+(?:to|through|thru|and|until|til|'til)\s+|\s*-\s*)([a-zA-Z0-9])$/i
  );
  if (!rangeMatch) return null;

  const caseHint = rangeMatch[1]?.toLowerCase() ?? '';
  let start = rangeMatch[2];
  let end = rangeMatch[3];
  if (/^(?:upper|capital|caps)/.test(caseHint)) {
    start = start.toUpperCase();
    end = end.toUpperCase();
  } else if (/^(?:lower|small)/.test(caseHint)) {
    start = start.toLowerCase();
    end = end.toLowerCase();
  }
  const cls = `[${start}-${end}]${quantifier}`;
  return {
    pattern: cls,
    label: `character range ${start}-${end}`,
    features: [`Character range ([${start}-${end}])`],
    needsMultiline: false,
    needsCaseInsensitive: false
  };
}

interface BlockSpec {
  pattern: string;
  open: string;
  close: string;
  negatedInnerChar: string;
  label: string;
  features: string[];
  isDualQuote?: boolean;
}

function resolveBlockSpec(rawDelimPhrase: string, quotes: string[]): BlockSpec | null {
  const delim = unmaskQuotes(rawDelimPhrase, quotes)
    .trim()
    .replace(/^(?:(?:the|all|each|every|any|matching|paired)\s+)+/i, '')
    .trim();

  if (/^(?:double[-\s_]?(?:quotes?|quot(?:ation|ed?)[\s_]+marks?|quotations?|quoted)|")$/i.test(delim)) {
    return {
      pattern: '"[^"\\r\\n]*"',
      open: '"',
      close: '"',
      negatedInnerChar: '"\\r\\n',
      label: 'double-quote blocks',
      features: ['Double-quote block ("[^"\\r\\n]*")']
    };
  }

  if (/^(?:single[-\s_]?(?:quotes?|quot(?:ation|ed?)[\s_]+marks?|quotations?|quoted)|apostrophes?|')$/i.test(delim)) {
    return {
      pattern: "'[^'\\r\\n]*'",
      open: "'",
      close: "'",
      negatedInnerChar: "'\\r\\n",
      label: 'single-quote blocks',
      features: ["Single-quote block ('[^'\\r\\n]*')"]
    };
  }

  if (/^(?:back[-\s_]?ticks?|back[-\s_]?quotes?|grave[\s_]+accents?|graves?|back[-\s_]?ticked|`)$/i.test(delim)) {
    return {
      pattern: '`[^`\\r\\n]*`',
      open: '`',
      close: '`',
      negatedInnerChar: '`\\r\\n',
      label: 'backtick blocks',
      features: ['Backtick block (`[^`\\r\\n]*`)']
    };
  }

  if (/^(?:quotes?|quot(?:ation|ed?)[\s_]+marks?|quotations?|quoted|strings?|quoted[\s_]+strings?)$/i.test(delim)) {
    return {
      pattern: '(?:"[^"\\r\\n]*"|\'[^\'\\r\\n]*\')',
      open: '["\']',
      close: '["\']',
      negatedInnerChar: '"\\\'\\r\\n',
      label: 'quotation mark blocks',
      features: ['Quoted block ((?:"[^"\\r\\n]*"|\'[^\'\\r\\n]*\'))'],
      isDualQuote: true
    };
  }

  if (/^(?:parentheses|parenthesis|parens?|parenthetical|parenthesized|round(?:ed)?[\s_]+brackets?|\(\s*\)|\\?[()])$/i.test(delim)) {
    return {
      pattern: '\\([^)\\r\\n]*\\)',
      open: '\\(',
      close: '\\)',
      negatedInnerChar: ')\\r\\n',
      label: 'parenthesis blocks',
      features: ['Parenthesis block (\\([^)\\r\\n]*\\))']
    };
  }

  if (/^(?:(?:curly[\s_]+)?braces?|curly[\s_]+brackets?|curly|braced|\{\s*\}|\\?[{}])$/i.test(delim)) {
    return {
      pattern: '\\{[^}\\r\\n]*\\}',
      open: '\\{',
      close: '\\}',
      negatedInnerChar: '}\\r\\n',
      label: 'curly brace blocks',
      features: ['Curly brace block (\\{[^}\\r\\n]*\\})']
    };
  }

  if (/^(?:(?:square[\s_]+)?brackets?|bracketed|\[\s*\]|\\?[\[\]])$/i.test(delim)) {
    return {
      pattern: '\\[[^\\]\\r\\n]*\\]',
      open: '\\[',
      close: '\\]',
      negatedInnerChar: '\\]\\r\\n',
      label: 'bracket blocks',
      features: ['Bracket block (\\[[^\\]\\r\\n]*\\])']
    };
  }

  if (/^(?:angle[\s_]+brackets?|angles?|angle[-\s_]bracketed|chevrons?|html[\s_]+tag(?:s|ged)?|xml[\s_]+tag(?:s|ged)?|tags?|<\s*>|\\?[<>])$/i.test(delim)) {
    return {
      pattern: '<[^>\\r\\n]*>',
      open: '<',
      close: '>',
      negatedInnerChar: '>\\r\\n',
      label: 'angle bracket blocks',
      features: ['Angle bracket block (<[^>\\r\\n]*>)']
    };
  }

  // Check single-character symbol from lexicon or quoted literal (e.g., "asterisk blocks", "pipe blocks", "*" blocks)
  const unmasked = delim;
  const entry = findLexiconEntry(delim);
  const sym = entry?.replaceLiteral ?? (unmasked.length === 1 ? unmasked : undefined);
  if (sym && sym.length === 1 && !/\w/.test(sym)) {
    const esc = escapeRegexLiteral(sym);
    const clsEsc = escapeCharClassLiteral(sym);
    return {
      pattern: `${esc}[^${clsEsc}\\r\\n]*${esc}`,
      open: esc,
      close: esc,
      negatedInnerChar: `${clsEsc}\\r\\n`,
      label: `${entry?.label ?? `'${sym}'`} blocks`,
      features: [`Delimited block (${esc}[^${clsEsc}\\r\\n]*${esc})`]
    };
  }

  return null;
}

/**
 * Resolves `<delimiter> block(s)` or `block(s) in/of/with <delimiter>` (which INCLUDE the surrounding delimiters).
 */
function tryResolveBlock(phrase: string, quotes: string[]): ResolvedTarget | null {
  if (/^blocks?$/i.test(phrase)) {
    return {
      pattern: '(?:\\([^)\\r\\n]*\\)|\\[[^\\]\\r\\n]*\\]|\\{[^}\\r\\n]*\\})',
      label: 'delimited blocks (parentheses, brackets, or braces)',
      features: ['Delimited block alternation ((...)|[...]|{...})'],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  const blockMatch = phrase.match(
    /^(?:(.+?)\s+blocks?|blocks?\s+(?:in|inside(?:[\s_]of)?|within|between|of|with|enclosed[\s_]+(?:in|by|with)|surrounded[\s_]+(?:in|by|with)|wrapped[\s_]+(?:in|by|with))\s+(.+))$/i
  );
  if (!blockMatch) return null;

  const delimPhrase = (blockMatch[1] ?? blockMatch[2]).trim();
  const spec = resolveBlockSpec(delimPhrase, quotes);
  if (!spec) return null;

  return {
    pattern: spec.pattern,
    label: spec.label,
    features: spec.features,
    needsMultiline: false,
    needsCaseInsensitive: false
  };
}

/**
 * Resolves inner/delimited content queries (EXCLUDING the surrounding delimiters):
 * - "quoted", "quoted text", "double-quoted text", "single-quoted text", "parenthesized text", "bracketed text", "braced text"
 * - "all text inside HTML tags" (Example #13)
 * - "text inside parentheses / brackets / braces / quotes", "between quotes"
 * - "everything between X and Y"
 */
function tryResolveInsideOrBetween(
  phrase: string,
  quotes: string[]
): ResolvedTarget | null {
  // Example #13: "text inside HTML tags" / "between opening and closing tag"
  if (
    /\b(?:text|content|chars|characters|everything|anything|what's)?\s*(?:in|inside|between|within)\s+(?:the\s+)?(?:first\s+)?(?:open(?:ing|ed)?\s+(?:and|&)\s+clos(?:e|ed|ing)\s+)?(?:html|xml)?\s*tags?\b/i.test(phrase)
  ) {
    return {
      pattern: '<([a-z]+)>(.*?)</\\1>',
      label: 'text inside matching HTML tags',
      features: [
        'Lazy/non-greedy quantifier (*?)',
        'Backreference to tag name (\\1)',
        'Capture group ($2)'
      ],
      needsMultiline: false,
      needsCaseInsensitive: true,
      defaultReplace: '$2',
      hasCaptureGroups: true
    };
  }

  // Concise "<delimiter>-ed [text/words/content/characters/chars/items/values/stuff]" forms (excludes surrounding delimiters)
  const conciseInnerSuffix = '(?:[\\s_]+(?:text|words?|content|characters?|chars?|items?|values?|stuff|parts?|segments?))?';
  if (new RegExp(`^quoted${conciseInnerSuffix}$`, 'i').test(phrase)) {
    return {
      pattern:
        '(?<=^(?:[^"\\r\\n]*"[^"\\r\\n]*")*[^"\\r\\n]*")[^"\\r\\n]+(?=")|(?<=^(?:[^\'\\r\\n]*\'[^\'\\r\\n]*\')*[^\'\\r\\n]*\')[^\'\\r\\n]+(?=\')',
      label: 'quoted text (excluding quotation marks)',
      features: [
        'Positive lookbehind for opening quote',
        'Negated character class ([^"\\r\\n]+)',
        'Positive lookahead ((?=["\']))'
      ],
      needsMultiline: true,
      needsCaseInsensitive: false
    };
  }

  if (new RegExp(`^double[-\\s_]quoted${conciseInnerSuffix}$`, 'i').test(phrase)) {
    return {
      pattern: '(?<=^(?:[^"\\r\\n]*"[^"\\r\\n]*")*[^"\\r\\n]*")[^"\\r\\n]+(?=")',
      label: 'double-quoted text (excluding quotation marks)',
      features: [
        'Positive lookbehind for opening double quote',
        'Negated character class ([^"\\r\\n]+)',
        'Positive lookahead ((?="))'
      ],
      needsMultiline: true,
      needsCaseInsensitive: false
    };
  }

  if (new RegExp(`^single[-\\s_]quoted${conciseInnerSuffix}$`, 'i').test(phrase)) {
    return {
      pattern: "(?<=^(?:[^'\\r\\n]*'[^'\\r\\n]*')*[^'\\r\\n]*')[^'\\r\\n]+(?=')",
      label: 'single-quoted text (excluding quotation marks)',
      features: [
        'Positive lookbehind for opening single quote',
        "Negated character class ([^'\\r\\n]+)",
        "Positive lookahead ((?='))"
      ],
      needsMultiline: true,
      needsCaseInsensitive: false
    };
  }

  if (new RegExp(`^(?:back[-\\s_]?ticked|back[-\\s_]?tick[-\\s_]quoted)${conciseInnerSuffix}$`, 'i').test(phrase)) {
    return {
      pattern: '(?<=^(?:[^`\\r\\n]*`[^`\\r\\n]*`)*[^`\\r\\n]*`)[^`\\r\\n]+(?=`)',
      label: 'backticked text (excluding backticks)',
      features: [
        'Positive lookbehind for opening backtick',
        'Negated character class ([^`\\r\\n]+)',
        'Positive lookahead ((?=`))'
      ],
      needsMultiline: true,
      needsCaseInsensitive: false
    };
  }

  if (new RegExp(`^(?:parenthesized|parenthetical)${conciseInnerSuffix}$`, 'i').test(phrase)) {
    return {
      pattern: '(?<=\\()[^)\\r\\n]+(?=\\))',
      label: 'parenthesized text (excluding parentheses)',
      features: [
        'Positive lookbehind ((?<=\\())',
        'Negated character class ([^)\\r\\n]+)',
        'Positive lookahead ((?=\\)))'
      ],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  if (new RegExp(`^(?:(?:square[-\\s_])?bracketed)${conciseInnerSuffix}$`, 'i').test(phrase)) {
    return {
      pattern: '(?<=\\[)[^\\]\\r\\n]+(?=\\])',
      label: 'bracketed text (excluding brackets)',
      features: [
        'Positive lookbehind ((?<=\\[))',
        'Negated character class ([^\\]\\r\\n]+)',
        'Positive lookahead ((?=\\]))'
      ],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  if (new RegExp(`^(?:(?:curly[-\\s_])?braced)${conciseInnerSuffix}$`, 'i').test(phrase)) {
    return {
      pattern: '(?<=\\{)[^}\\r\\n]+(?=\\})',
      label: 'braced text (excluding braces)',
      features: [
        'Positive lookbehind ((?<=\\{))',
        'Negated character class ([^}\\r\\n]+)',
        'Positive lookahead ((?=\\}))'
      ],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  if (new RegExp(`^angle[-\\s_]bracketed${conciseInnerSuffix}$`, 'i').test(phrase)) {
    return {
      pattern: '(?<=<)[^>\\r\\n]+(?=>)',
      label: 'angle-bracketed text (excluding angle brackets)',
      features: [
        'Positive lookbehind ((?<=<))',
        'Negated character class ([^>\\r\\n]+)',
        'Positive lookahead ((?=>))'
      ],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  // "text inside parentheses / brackets / braces / quotes" or "between quotes"
  // Matches strictly the inner content (excluding surrounding delimiters) via lookbehinds/lookaheads.
  const insideContainerMatch = phrase.match(
    /^(?:(?:(?:all|the)\s+)*(?:text|content|characters?|chars?|words?|stuff|everything|anything|values?|items?)\s+(?:(?:that'?s|that\s+(?:is|are)|which\s+(?:is|are))\s+)?(?:inside|within|between|in|enclosed[\s_]+(?:in|by|with)|wrapped[\s_]+(?:in|by|with)|surrounded[\s_]+(?:in|by|with))|(?:inside|within|between|in|enclosed[\s_]+(?:in|by|with)|wrapped[\s_]+(?:in|by|with)|surrounded[\s_]+(?:in|by|with)))\s+(?:of\s+)?(?:(?:the|all|each|every|any|matching|paired)\s+)*(.+)$/i
  );
  if (insideContainerMatch) {
    const container = insideContainerMatch[1].trim();
    if (/^(?:parenthes[ei]s|parens?|round(?:ed)?[\s_]+brackets?)$/i.test(container)) {
      return {
        pattern: '(?<=\\()[^)\\r\\n]+(?=\\))',
        label: 'text inside parentheses',
        features: [
          'Positive lookbehind ((?<=\\())',
          'Negated character class ([^)\\r\\n]+)',
          'Positive lookahead ((?=\\)))'
        ],
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
    if (/^(?:(?:square[\s_]+)?brackets?)$/i.test(container)) {
      return {
        pattern: '(?<=\\[)[^\\]\\r\\n]+(?=\\])',
        label: 'text inside square brackets',
        features: [
          'Positive lookbehind ((?<=\\[))',
          'Negated character class ([^\\]\\r\\n]+)',
          'Positive lookahead ((?=\\]))'
        ],
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
    if (/^(?:(?:curly[\s_]+)?braces?|curly[\s_]+brackets?)$/i.test(container)) {
      return {
        pattern: '(?<=\\{)[^}\\r\\n]+(?=\\})',
        label: 'text inside curly braces',
        features: [
          'Positive lookbehind ((?<=\\{))',
          'Negated character class ([^}\\r\\n]+)',
          'Positive lookahead ((?=\\}))'
        ],
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
    if (/^(?:angle[\s_]+brackets?|angles?|chevrons?)$/i.test(container)) {
      return {
        pattern: '(?<=<)[^>\\r\\n]+(?=>)',
        label: 'text inside angle brackets',
        features: [
          'Positive lookbehind ((?<=<))',
          'Negated character class ([^>\\r\\n]+)',
          'Positive lookahead ((?=>))'
        ],
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
    if (/^(?:double[-\s_]+(?:quotes?|quot(?:ation|ed?)[\s_]+marks?|quotations?))$/i.test(container)) {
      return {
        pattern: '(?<=^(?:[^"\\r\\n]*"[^"\\r\\n]*")*[^"\\r\\n]*")[^"\\r\\n]+(?=")',
        label: 'text inside double quotes',
        features: [
          'Positive lookbehind for opening double quote',
          'Negated character class ([^"\\r\\n]+)',
          'Positive lookahead ((?="))'
        ],
        needsMultiline: true,
        needsCaseInsensitive: false
      };
    }
    if (/^(?:single[-\s_]+(?:quotes?|quot(?:ation|ed?)[\s_]+marks?|quotations?)|apostrophes?)$/i.test(container)) {
      return {
        pattern: "(?<=^(?:[^'\\r\\n]*'[^'\\r\\n]*')*[^'\\r\\n]*')[^'\\r\\n]+(?=')",
        label: 'text inside single quotes',
        features: [
          'Positive lookbehind for opening single quote',
          "Negated character class ([^'\\r\\n]+)",
          "Positive lookahead ((?='))"
        ],
        needsMultiline: true,
        needsCaseInsensitive: false
      };
    }
    if (/^(?:back[-\s_]?ticks?|back[-\s_]?quotes?|grave[\s_]+accents?|graves?)$/i.test(container)) {
      return {
        pattern: '(?<=^(?:[^`\\r\\n]*`[^`\\r\\n]*`)*[^`\\r\\n]*`)[^`\\r\\n]+(?=`)',
        label: 'text inside backticks',
        features: [
          'Positive lookbehind for opening backtick',
          'Negated character class ([^`\\r\\n]+)',
          'Positive lookahead ((?=`))'
        ],
        needsMultiline: true,
        needsCaseInsensitive: false
      };
    }
    if (/^(?:quotes?|quot(?:ation|ed?)[\s_]+marks?|quotations?|strings?|quoted[\s_]+strings?)$/i.test(container)) {
      return {
        pattern:
          '(?<=^(?:[^"\\r\\n]*"[^"\\r\\n]*")*[^"\\r\\n]*")[^"\\r\\n]+(?=")|(?<=^(?:[^\'\\r\\n]*\'[^\'\\r\\n]*\')*[^\'\\r\\n]*\')[^\'\\r\\n]+(?=\')',
        label: 'text inside quotes',
        features: [
          'Positive lookbehind for opening quote',
          'Negated character class ([^"\\r\\n]+)',
          'Positive lookahead ((?=["\']))'
        ],
        needsMultiline: true,
        needsCaseInsensitive: false
      };
    }

    // "between <A> and <B>"
    const betweenPair = container.match(/^(.+?)\s+and\s+(.+)$/i);
    if (betweenPair) {
      const left = resolveDelimiterOrLiteral(betweenPair[1], quotes);
      const right = resolveDelimiterOrLiteral(betweenPair[2], quotes);
      return {
        pattern: `(?<=${left})[^\\r\\n]+?(?=${right})`,
        label: `text between ${left} and ${right}`,
        features: [
          `Positive lookbehind ((?<=${left}))`,
          'Lazy quantifier ([^\\r\\n]+?)',
          `Positive lookahead ((?=${right}))`
        ],
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
  }

  return null;
}

/**
 * Resolves structural word/line modifiers:
 * - "words starting with X" / "words ending in X" / "words containing X"
 * - "lines starting with X" / "lines ending with X" / "lines containing X" / "lines without X"
 */
function tryResolveAffixOrLineFilter(
  phrase: string,
  quotes: string[]
): ResolvedTarget | null {
  // 0a. First / last N (chars / words / letters / digits / . / *) per line
  // Supports concise forms like "last 4 per", "last 4 . per", "last 4 * per", "last 4 chars per"
  const { cleaned: basePhrase, hasPerLine } = extractPerLineSuffix(phrase);
  const firstLastLineMatch = basePhrase.match(
    /^(?:the\s+)?(first|last)(?:\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten))?(?:\s+(words?|characters?|chars?|letters?|digits?|\.|\*))?$/i
  );
  if (firstLastLineMatch && (hasPerLine || firstLastLineMatch[3] !== undefined)) {
    const pos = firstLastLineMatch[1].toLowerCase();
    const count = firstLastLineMatch[2] ? parseNumberToken(firstLastLineMatch[2]) ?? 1 : 1;
    const rawUnitToken = firstLastLineMatch[3]?.toLowerCase() ?? 'chars';
    const unitLabel = rawUnitToken === '.' || rawUnitToken === '*' ? 'chars' : rawUnitToken;

    let unitPat = '.';
    if (unitLabel.startsWith('word')) unitPat = '\\w+';
    else if (unitLabel.startsWith('letter')) unitPat = '[a-zA-Z]';
    else if (unitLabel.startsWith('digit')) unitPat = '\\d';

    const quant = count > 1 && unitPat !== '\\w+' ? `{${count}}` : '';
    const pattern = pos === 'first' ? `^${unitPat}${quant}` : `${unitPat}${quant}$`;
    return {
      pattern,
      label: `${pos} ${count > 1 ? count + ' ' : ''}${unitLabel} of each line`,
      features: [pos === 'first' ? 'Line start anchor (^)' : 'Line end anchor ($)'],
      needsMultiline: true,
      needsCaseInsensitive: false
    };
  }

  // 0b. "words with 3 to 5 letters" / "numbers with 4 digits"
  const wordsWithLen = phrase.match(
    /^words?\s+(?:with|of|having)\s+(.+?)\s+(?:letters?|characters?|chars?|length)$/i
  );
  if (wordsWithLen) {
    const qExt = extractQuantifier(`${wordsWithLen[1]} letters`);
    if (qExt.quantifier) {
      return {
        pattern: `\\b[a-zA-Z]${qExt.quantifier}\\b`,
        label: `words with ${wordsWithLen[1]} letters`,
        features: ['Word boundary (\\b)', 'Character range ([a-zA-Z])', ...(qExt.feature ? [qExt.feature] : [])],
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
  }

  const numbersWithLen = phrase.match(
    /^numbers?\s+(?:with|of|having)\s+(.+?)\s+(?:digits?|length)$/i
  );
  if (numbersWithLen) {
    const qExt = extractQuantifier(`${numbersWithLen[1]} digits`);
    if (qExt.quantifier) {
      return {
        pattern: `\\b\\d${qExt.quantifier}\\b`,
        label: `numbers with ${numbersWithLen[1]} digits`,
        features: ['Word boundary (\\b)', 'Digit shorthand (\\d)', ...(qExt.feature ? [qExt.feature] : [])],
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
  }

  // 1. Words starting/ending/containing/not-containing
  const wordStart = phrase.match(
    /^words?\s+(?:(?:that|which)\s+)?(?:starts?(?:ed|ing)?|beg[ai]ns?(?:ning)?)[\s_]+(?:with|in)\s+(.+)$/i
  );
  if (wordStart) {
    const lit = resolveRawLiteralOrCharClass(wordStart[1], quotes);
    return {
      pattern: `\\b${lit}[a-zA-Z0-9_]*\\b`,
      label: `words starting with ${lit}`,
      features: ['Word boundary (\\b)', 'Word continuation ([a-zA-Z0-9_]*)'],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  const wordEnd = phrase.match(
    /^words?\s+(?:(?:that|which)\s+)?ends?(?:ed|ing)?[\s_]+(?:with|in)\s+(.+)$/i
  );
  if (wordEnd) {
    const lit = resolveRawLiteralOrCharClass(wordEnd[1], quotes);
    return {
      pattern: `\\b[a-zA-Z0-9_]*${lit}\\b`,
      label: `words ending with ${lit}`,
      features: ['Word boundary (\\b)', 'Word prefix ([a-zA-Z0-9_]*)'],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  const wordNotContain = phrase.match(
    /^words?\s+(?:without|lacking|omitting|(?:(?:that|which)\s+)?(?:do(?:es)?[\s_]+not|don'?t|doesn'?t)\s+(?:contains?|hav(?:e|ing))|not\s+(?:containing|having))\s+(.+)$/i
  );
  if (wordNotContain) {
    const lit = resolveRawLiteralOrCharClass(wordNotContain[1], quotes);
    return {
      pattern: `\\b(?![a-zA-Z0-9_]*${lit})[a-zA-Z0-9_]+\\b`,
      label: `words not containing ${lit}`,
      features: ['Word boundary (\\b)', `Negative lookahead ((?![a-zA-Z0-9_]*${lit}))`],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  const wordContain = phrase.match(
    /^words?\s+(?:(?:that|which)\s+)?(?:contain(?:s|ed|ing)?|with|hav(?:e|ing)|has)\s+(.+)$/i
  );
  if (wordContain) {
    const lit = resolveRawLiteralOrCharClass(wordContain[1], quotes);
    return {
      pattern: `\\b[a-zA-Z0-9_]*${lit}[a-zA-Z0-9_]*\\b`,
      label: `words containing ${lit}`,
      features: ['Word boundary (\\b)', 'Substring match'],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  // 1b. Strings / quotations starting/ending/containing/not-containing (includes surrounding quotes)
  const stringStart = phrase.match(
    /^(?:strings?|quotations?|quoted[\s_]+strings?)\s+(?:(?:that|which)\s+)?(?:starts?(?:ed|ing)?|beg[ai]ns?(?:ning)?)[\s_]+(?:with|in)\s+(.+)$/i
  );
  if (stringStart) {
    const lit = resolveRawLiteralOrCharClass(stringStart[1], quotes);
    return {
      pattern: `(?:"${lit}[^"\\r\\n]*"|'${lit}[^'\\r\\n]*')`,
      label: `quoted strings starting with ${lit}`,
      features: ['Quoted string literal', `Prefix match (${lit})`],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  const stringEnd = phrase.match(
    /^(?:strings?|quotations?|quoted[\s_]+strings?)\s+(?:(?:that|which)\s+)?ends?(?:ed|ing)?[\s_]+(?:with|in)\s+(.+)$/i
  );
  if (stringEnd) {
    const lit = resolveRawLiteralOrCharClass(stringEnd[1], quotes);
    return {
      pattern: `(?:"[^"\\r\\n]*${lit}"|'[^'\\r\\n]*${lit}')`,
      label: `quoted strings ending with ${lit}`,
      features: ['Quoted string literal', `Suffix match (${lit})`],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  const stringNotContain = phrase.match(
    /^(?:strings?|quotations?|quoted[\s_]+strings?)\s+(?:without|lacking|omitting|(?:(?:that|which)\s+)?(?:do(?:es)?[\s_]+not|don'?t|doesn'?t)\s+(?:contains?|hav(?:e|ing))|not\s+(?:containing|having))\s+(.+)$/i
  );
  if (stringNotContain) {
    const lit = resolveRawLiteralOrCharClass(stringNotContain[1], quotes);
    return {
      pattern: `(?:"(?![^"\\r\\n]*${lit})[^"\\r\\n]*"|'(?![^'\\r\\n]*${lit})[^'\\r\\n]*')`,
      label: `quoted strings not containing ${lit}`,
      features: ['Quoted string literal', `Negative lookahead ((?![^"]*${lit}))`],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  const stringContain = phrase.match(
    /^(?:strings?|quotations?|quoted[\s_]+strings?)\s+(?:(?:that|which)\s+)?(?:contain(?:s|ed|ing)?|with|hav(?:e|ing)|has)\s+(.+)$/i
  );
  if (stringContain) {
    const lit = resolveRawLiteralOrCharClass(stringContain[1], quotes);
    return {
      pattern: `(?:"[^"\\r\\n]*${lit}[^"\\r\\n]*"|'[^'\\r\\n]*${lit}[^'\\r\\n]*')`,
      label: `quoted strings containing ${lit}`,
      features: ['Quoted string literal', `Substring match (${lit})`],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  // 1c. <delimiter> blocks starting/ending/containing/not-containing (includes surrounding delimiters)
  const blockAffixMatch = phrase.match(
    /^(.+?)\s+blocks?\s+(?:((?:(?:that|which)\s+)?(?:do(?:es)?[\s_]+not|don'?t|doesn'?t)\s+(?:contains?|hav(?:e|ing))|not\s+(?:containing|having)|without|lacking|omitting)|(?:(?:that|which)\s+)?(starts?(?:ed|ing)?[\s_]+(?:with|in)|beg[ai]ns?(?:ning)?[\s_]+(?:with|in)|ends?(?:ed|ing)?[\s_]+(?:with|in)|contain(?:s|ed|ing)?|with|hav(?:e|ing)|has))\s+(.+)$/i
  );
  if (blockAffixMatch) {
    const spec = resolveBlockSpec(blockAffixMatch[1].trim(), quotes);
    if (spec) {
      const negOp = blockAffixMatch[2];
      const posOp = blockAffixMatch[3]?.toLowerCase() ?? '';
      const lit = resolveRawLiteralOrCharClass(blockAffixMatch[4], quotes);
      const negCls = `[^${spec.negatedInnerChar}]*`;

      if (negOp) {
        const pat = spec.isDualQuote
          ? `(?:"(?![^"\\r\\n]*${lit})[^"\\r\\n]*"|'(?![^'\\r\\n]*${lit})[^'\\r\\n]*')`
          : `${spec.open}(?!${negCls}${lit})${negCls}${spec.close}`;
        return {
          pattern: pat,
          label: `${spec.label} not containing ${lit}`,
          features: [...spec.features, `Negative lookahead ((?!${negCls}${lit}))`],
          needsMultiline: false,
          needsCaseInsensitive: false
        };
      }

      if (posOp.startsWith('start') || posOp.startsWith('beg')) {
        const pat = spec.isDualQuote
          ? `(?:"${lit}[^"\\r\\n]*"|'${lit}[^'\\r\\n]*')`
          : `${spec.open}${lit}${negCls}${spec.close}`;
        return {
          pattern: pat,
          label: `${spec.label} starting with ${lit}`,
          features: [...spec.features, `Prefix match (${lit})`],
          needsMultiline: false,
          needsCaseInsensitive: false
        };
      }

      if (posOp.startsWith('end')) {
        const pat = spec.isDualQuote
          ? `(?:"[^"\\r\\n]*${lit}"|'[^'\\r\\n]*${lit}')`
          : `${spec.open}${negCls}${lit}${spec.close}`;
        return {
          pattern: pat,
          label: `${spec.label} ending with ${lit}`,
          features: [...spec.features, `Suffix match (${lit})`],
          needsMultiline: false,
          needsCaseInsensitive: false
        };
      }

      const pat = spec.isDualQuote
        ? `(?:"[^"\\r\\n]*${lit}[^"\\r\\n]*"|'[^'\\r\\n]*${lit}[^'\\r\\n]*')`
        : `${spec.open}${negCls}${lit}${negCls}${spec.close}`;
      return {
        pattern: pat,
        label: `${spec.label} containing ${lit}`,
        features: [...spec.features, `Substring match (${lit})`],
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
  }

  // 2. Lines starting/ending/containing/not-containing
  const lineStart = phrase.match(
    /^lines?\s+(?:(?:that|which)\s+)?(?:starts?(?:ed|ing)?|beg[ai]ns?(?:ning)?)[\s_]+(?:with|in)\s+(.+)$/i
  );
  if (lineStart) {
    const lit = resolveRawLiteralOrCharClass(lineStart[1], quotes);
    return {
      pattern: `^[ \\t]*${lit}.*$`,
      label: `lines starting with ${lit}`,
      features: ['Line start/end anchors (^...$)', 'Wildcard (.*)'],
      needsMultiline: true,
      needsCaseInsensitive: false,
      isWholeLine: true
    };
  }

  const lineEnd = phrase.match(
    /^lines?\s+(?:(?:that|which)\s+)?ends?(?:ed|ing)?[\s_]+(?:with|in)\s+(.+)$/i
  );
  if (lineEnd) {
    const lit = resolveRawLiteralOrCharClass(lineEnd[1], quotes);
    return {
      pattern: `^.*${lit}[ \\t]*$`,
      label: `lines ending with ${lit}`,
      features: ['Line start/end anchors (^...$)', 'Wildcard (.*)'],
      needsMultiline: true,
      needsCaseInsensitive: false,
      isWholeLine: true
    };
  }

  const lineNotContain = phrase.match(
    /^lines?\s+(?:without|lacking|omitting|(?:(?:that|which)\s+)?(?:do(?:es)?[\s_]+not|don'?t|doesn'?t)\s+(?:contains?|hav(?:e|ing))|not\s+(?:containing|having))\s+(.+)$/i
  );
  if (lineNotContain) {
    const lit = resolveRawLiteralOrCharClass(lineNotContain[1], quotes);
    return {
      pattern: `^(?!.*${lit}).+$`,
      label: `lines not containing ${lit}`,
      features: ['Negative lookahead ((?!.*...))', 'Line anchors (^...$)'],
      needsMultiline: true,
      needsCaseInsensitive: false,
      isWholeLine: true
    };
  }

  const lineContain = phrase.match(
    /^lines?\s+(?:(?:that|which)\s+)?(?:contain(?:s|ed|ing)?|with|hav(?:e|ing)|has)\s+(.+)$/i
  );
  if (lineContain) {
    const lit = resolveRawLiteralOrCharClass(lineContain[1], quotes);
    return {
      pattern: `^.*${lit}.*$`,
      label: `lines containing ${lit}`,
      features: ['Line start/end anchors (^...$)', 'Wildcard (.*)'],
      needsMultiline: true,
      needsCaseInsensitive: false,
      isWholeLine: true
    };
  }

  // 3. "everything after X" / "everything before X"
  const afterMatch = phrase.match(
    /^(?:everything|anything|text|content|characters?|chars?|rest[\s_]+of[\s_]+(?:the[\s_]+)?line|all(?:[\s_]+(?:text|content|characters?|chars?))?)[\s_]+after\s+(.+)$/i
  );
  if (afterMatch) {
    const lit = resolveDelimiterOrLiteral(afterMatch[1], quotes);
    return {
      pattern: `(?<=${lit}).*$`,
      label: `text after ${lit}`,
      features: [`Positive lookbehind ((?<=${lit}))`, 'Line end anchor ($)'],
      needsMultiline: true,
      needsCaseInsensitive: false
    };
  }

  const beforeMatch = phrase.match(
    /^(?:everything|anything|text|content|characters?|chars?|all(?:[\s_]+(?:text|content|characters?|chars?))?)[\s_]+before\s+(.+)$/i
  );
  if (beforeMatch) {
    const lit = resolveDelimiterOrLiteral(beforeMatch[1], quotes);
    return {
      pattern: `^.*?(?=${lit})`,
      label: `text before ${lit}`,
      features: [`Positive lookahead ((?=${lit}))`, 'Lazy quantifier (.*?)'],
      needsMultiline: true,
      needsCaseInsensitive: false
    };
  }

  return null;
}

/**
 * Resolves American/British spelling variants or "either X or Y" / "X or Y".
 */
function tryResolveAlternationOrVariant(
  phrase: string,
  quotes: string[],
  wholeWordHint: boolean,
  quantifier: string
): ResolvedTarget | null {
  // Example #6: "'color' whether it's spelled the American way or British way ('colour')"
  if (/\b(?:american|british)\b.*\b(?:spelled|spelling|way)\b/i.test(phrase)) {
    const qMatches = Array.from(phrase.matchAll(/__Q(\d+)__/g)).map((m) => quotes[parseInt(m[1], 10)]);
    if (qMatches.length >= 2) {
      const v = synthesizeTwoWordVariantPattern(qMatches[0], qMatches[1], true);
      return {
        pattern: v.pattern,
        label: `'${qMatches[0]}' or '${qMatches[1]}'`,
        features: v.features,
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
    if (qMatches.length === 1) {
      const w = qMatches[0].toLowerCase();
      const pair = US_UK_SPELLING_MAP[w];
      if (pair) {
        const v = synthesizeTwoWordVariantPattern(pair[0], pair[1], true);
        return {
          pattern: v.pattern,
          label: `'${pair[0]}' or '${pair[1]}'`,
          features: v.features,
          needsMultiline: false,
          needsCaseInsensitive: false
        };
      }
    }
    // Check unquoted word before "whether"
    const beforeWhether = phrase.split(/\bwhether\b/i)[0].trim();
    const cleanedWord = stripDeterminersAndClassifiers(beforeWhether).cleaned.toLowerCase();
    const pair = US_UK_SPELLING_MAP[cleanedWord];
    if (pair) {
      const v = synthesizeTwoWordVariantPattern(pair[0], pair[1], true);
      return {
        pattern: v.pattern,
        label: `'${pair[0]}' or '${pair[1]}'`,
        features: v.features,
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
  }

  // General "either <A> or <B>", "<A> or <B>", "<A> and <B>" (for character classes), or "<A>, <B>, or <C>"
  if (/\s+(?:or|and)\s+/i.test(phrase) && !/\b(?:whether|more|less|between|first\s+and\s+last|opening\s+and\s+closing|leading\s+and\s+trailing)\b/i.test(phrase)) {
    const cleanedTop = phrase.replace(/^either\s+/i, '').trim();
    const rawParts = cleanedTop
      .split(/\s*(?:,?\s+\b(?:or|and)\b\s+|,\s*)/i)
      .map((p) => stripDeterminersAndClassifiers(p).cleaned)
      .filter(Boolean);

    if (rawParts.length === 2) {
      const [leftRaw, rightRaw] = rawParts;
      const leftEntry = findLexiconEntry(leftRaw);
      const rightEntry = findLexiconEntry(rightRaw);

      if (leftEntry?.charClassChars && rightEntry?.charClassChars) {
        const combined = `[${leftEntry.charClassChars}${rightEntry.charClassChars}]${quantifier}`;
        return {
          pattern: combined,
          label: `${leftEntry.label} or ${rightEntry.label}`,
          features: [`Character class (${combined})`],
          needsMultiline: false,
          needsCaseInsensitive: false
        };
      }

      if (/\s+or\s+/i.test(phrase)) {
        const leftUnmasked = unmaskQuotes(leftRaw, quotes).trim();
        const rightUnmasked = unmaskQuotes(rightRaw, quotes).trim();

        if (/^\w+$/.test(leftUnmasked) && /^\w+$/.test(rightUnmasked) && !leftEntry && !rightEntry) {
          const v = synthesizeTwoWordVariantPattern(leftUnmasked, rightUnmasked, wholeWordHint);
          return {
            pattern: v.pattern,
            label: `'${leftUnmasked}' or '${rightUnmasked}'`,
            features: v.features,
            needsMultiline: false,
            needsCaseInsensitive: false
          };
        }

        const p1 = leftEntry ? leftEntry.findPattern : resolveRawLiteralOrCharClass(leftRaw, quotes);
        const p2 = rightEntry ? rightEntry.findPattern : resolveRawLiteralOrCharClass(rightRaw, quotes);
        return {
          pattern: `(?:${p1}|${p2})`,
          label: `${leftUnmasked} or ${rightUnmasked}`,
          features: ['Non-capturing alternation ((?:a|b))'],
          needsMultiline: Boolean(leftEntry?.needsMultiline || rightEntry?.needsMultiline),
          needsCaseInsensitive: false
        };
      }
    } else if (rawParts.length > 2) {
      const entries = rawParts.map((p) => findLexiconEntry(p));
      if (entries.every((e) => e && e.charClassChars)) {
        const chars = entries.map((e) => e!.charClassChars).join('');
        const combined = `[${chars}]${quantifier}`;
        return {
          pattern: combined,
          label: rawParts.join(', '),
          features: [`Character class (${combined})`],
          needsMultiline: false,
          needsCaseInsensitive: false
        };
      }
      if (/\s+or\s+/i.test(phrase)) {
        const alts = rawParts.map((p, idx) =>
          entries[idx] ? entries[idx]!.findPattern : resolveRawLiteralOrCharClass(p, quotes)
        );
        return {
          pattern: `(?:${alts.join('|')})`,
          label: rawParts.join(' or '),
          features: ['Non-capturing alternation ((?:a|b|c))'],
          needsMultiline: false,
          needsCaseInsensitive: false
        };
      }
    }
  }

  return null;
}

function isValidRegex(pattern: string): boolean {
  if (!pattern) return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects whether an unquoted token is an explicit raw regular expression or character class
 * (e.g., \w+, \d{2,4}, [a-z0-9_]+, (\w+), (?<=\$)\d+, foo|bar, ^\s*#.*$, etc.).
 */
function isUnquotedRawRegex(token: string): boolean {
  const s = token.trim();
  if (!s || !isValidRegex(s)) return false;

  // Unquoted raw regexes must not contain unescaped whitespace outside of [...] character classes
  const withoutCharClasses = s.replace(/\[[^\]]*\]/g, '[]');
  if (/\s/.test(withoutCharClasses)) {
    return false;
  }

  // 1. Contains a regex escape sequence (\w, \d, \s, \b, \B, \t, \n, \r, \., \*, etc.)
  if (/\\[dDwWsStrnvfbB0]|\\[.*+?^${}()|[\]\\/]/.test(s)) {
    return true;
  }

  // 2. Contains a character class [...]
  if (/\[[^\]]+\]/.test(s)) {
    return true;
  }

  // 3. Contains a regex group or lookaround (...)
  if (/\((?:\?:|\?=|\?!|\?<=|\?<!|[^)]*[\\[\].*+?|^$][^)]*)\)/.test(s) || /^\([^()\s]+\)[+*?]?$/.test(s)) {
    return true;
  }

  // 4. Contains a curly quantifier {n}, {n,}, {n,m}
  if (/\{(?:\d+|\d+,\d*)\}\??/.test(s)) {
    return true;
  }

  // 5. Single non-whitespace token with pipe alternation (e.g. foo|bar)
  if (!/\s/.test(s) && /^[^|]+(?:\|[^|]+)+$/.test(s)) {
    return true;
  }

  // 6. Single non-whitespace token ending with a regex quantifier (+, *, ?, +?, *?, ??)
  if (!/\s/.test(s) && s.length >= 2 && /[a-zA-Z0-9._\])][+*?]\??$/.test(s)) {
    return true;
  }

  // 7. Single non-whitespace token with ^ or $ line anchor attached
  if (!/\s/.test(s) && s.length >= 2 && (/^\^\S+$/.test(s) || /^\S+\$$/.test(s))) {
    return true;
  }

  return false;
}

function resolveRawLiteralOrCharClass(phrase: string, quotes: string[]): string {
  const { cleaned } = stripDeterminersAndClassifiers(phrase);
  const singleQuoteMatch = cleaned.match(/^__Q(\d+)__$/);
  if (singleQuoteMatch) {
    return escapeRegexLiteral(quotes[parseInt(singleQuoteMatch[1], 10)]);
  }
  const rawRegexMatch = cleaned.match(/^__R(\d+)__$/);
  if (rawRegexMatch) {
    const rawPat = quotes[parseInt(rawRegexMatch[1], 10)];
    return isValidRegex(rawPat) ? rawPat : escapeRegexLiteral(rawPat);
  }
  const entry = findLexiconEntry(cleaned);
  if (entry) {
    return entry.singleUnitPattern;
  }
  const unmasked = unmaskQuotes(cleaned, quotes).trim();
  const slashMatch = unmasked.match(/^\/(.+)\/$/);
  if (slashMatch && isValidRegex(slashMatch[1])) {
    return slashMatch[1];
  }
  if (isUnquotedRawRegex(unmasked)) {
    return unmasked;
  }
  return escapeRegexLiteral(unmasked);
}

/**
 * Resolves a delimiter or lookaround target phrase (e.g. "an equals sign or colon", "a dollar sign", "a hyphen")
 */
export function resolveDelimiterOrLiteral(phrase: string, quotes: string[]): string {
  const { cleaned } = stripDeterminersAndClassifiers(phrase);

  const singleQuoteMatch = cleaned.match(/^__Q(\d+)__$/);
  if (singleQuoteMatch) {
    return escapeRegexLiteral(quotes[parseInt(singleQuoteMatch[1], 10)]);
  }

  const rawRegexMatch = cleaned.match(/^__R(\d+)__$/);
  if (rawRegexMatch) {
    const rawPat = quotes[parseInt(rawRegexMatch[1], 10)];
    return isValidRegex(rawPat) ? rawPat : escapeRegexLiteral(rawPat);
  }

  // Check if multiple delimiters joined by "or" / "and" / ","
  if (/\s+(?:or|and|nor)\s+|,/i.test(cleaned)) {
    const parts = cleaned
      .split(/\s*(?:,|\bor\b|\band\b|\bnor\b)\s*/i)
      .map((p) => stripDeterminersAndClassifiers(p).cleaned)
      .filter(Boolean);

    const charClassParts: string[] = [];
    let allCharClass = true;
    for (const part of parts) {
      const entry = findLexiconEntry(part);
      if (entry?.charClassChars) {
        charClassParts.push(entry.charClassChars);
      } else if (part.length === 1) {
        charClassParts.push(escapeCharClassLiteral(part));
      } else {
        allCharClass = false;
        break;
      }
    }

    if (allCharClass && charClassParts.length > 1) {
      // Preserve canonical ordering [:=] for colon and equals
      const joined = charClassParts.join('');
      if (joined === '=:' || joined === ':=') {
        return '[:=]';
      }
      return `[${joined}]`;
    }
  }

  const entry = findLexiconEntry(cleaned);
  if (entry) {
    return entry.singleUnitPattern;
  }

  const unmasked = unmaskQuotes(cleaned, quotes).trim();
  const slashMatch = unmasked.match(/^\/(.+)\/$/);
  if (slashMatch && isValidRegex(slashMatch[1])) {
    return slashMatch[1];
  }
  if (isUnquotedRawRegex(unmasked)) {
    return unmasked;
  }

  return escapeRegexLiteral(unmasked);
}

/**
 * Main target resolver: resolves any natural language target clause into a structured regex pattern.
 */
export function resolveTargetClause(
  rawTargetClause: string,
  quotes: string[],
  context?: {
    hasCurrencyLookbehind?: boolean;
    locationHint?: string;
    isDeleteLineContext?: boolean;
  }
): ResolvedTarget {
  // 1. Extract quantifiers first ("three to five", "at least 2", "4", etc.)
  const quantExtract = extractQuantifier(rawTargetClause);
  const quantifier = quantExtract.quantifier;
  const quantFeatures = quantExtract.feature ? [quantExtract.feature] : [];

  // Special case from extractQuantifier: "5-letter words" or "4-digit numbers"
  if (quantExtract.remainingText === 'letters_as_word') {
    return {
      pattern: `\\b[a-zA-Z]${quantifier}\\b`,
      label: `${quantifier}-letter words`,
      features: ['Word boundary (\\b)', 'Character range ([a-zA-Z])', ...quantFeatures],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }
  if (quantExtract.remainingText === 'digits_as_word') {
    return {
      pattern: `\\b\\d${quantifier}\\b`,
      label: `${quantifier}-digit numbers`,
      features: ['Word boundary (\\b)', 'Digit shorthand (\\d)', ...quantFeatures],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  // 2. Strip determiners & detect boundary hints
  const {
    cleaned,
    wholeWordHint,
    startOfLineHint,
    endOfLineHint
  } = stripDeterminersAndClassifiers(quantExtract.remainingText);

  const effectiveWholeWord = wholeWordHint || context?.locationHint === 'whole-word';

  // 3a. Check if the cleaned target is a single quoted literal (__Q0__)
  const singleQuoteMatch = cleaned.match(/^__Q(\d+)__$/);
  if (singleQuoteMatch) {
    const literal = quotes[parseInt(singleQuoteMatch[1], 10)];
    const escaped = escapeRegexLiteral(literal);
    const applyWordBounds = effectiveWholeWord && /^\w+$/.test(literal);
    const pat = applyWordBounds
      ? `\\b${escaped}\\b`
      : quantifier
        ? `(?:${escaped})${quantifier}`
        : escaped;
    const features = [...quantFeatures];
    if (applyWordBounds) features.push('Word boundary anchor (\\b)');
    else features.push(`Literal match (${escaped})`);

    return {
      pattern: finalizeLineAnchors(pat, startOfLineHint, endOfLineHint, features),
      label: `'${literal}'`,
      features,
      needsMultiline: startOfLineHint || endOfLineHint,
      needsCaseInsensitive: false
    };
  }

  // 3b. Check if the cleaned target is a backtick or tilde raw regex token (__R0__)
  const rawRegexTokenMatch = cleaned.match(/^__R(\d+)__$/);
  if (rawRegexTokenMatch) {
    const rawPat = quotes[parseInt(rawRegexTokenMatch[1], 10)].trim();
    const isPlainLexiconName = /^[a-zA-Z_ -]+$/.test(rawPat) && Boolean(findLexiconEntry(rawPat));
    if (!isPlainLexiconName && isValidRegex(rawPat)) {
      const isAtomic = /^(\\[dwsDWS]|\\.|[^\\[\]()|+?*{}]|\[[^\]]+\])$/.test(rawPat);
      let pat = quantifier
        ? isAtomic
          ? `${rawPat}${quantifier}`
          : `(?:${rawPat})${quantifier}`
        : rawPat;
      if (effectiveWholeWord && /^\w+$/.test(rawPat)) {
        pat = `\\b${pat}\\b`;
      }
      const features = [`Direct regular expression (${pat})`, ...quantFeatures];
      pat = finalizeLineAnchors(pat, startOfLineHint, endOfLineHint, features);
      return {
        pattern: pat,
        label: `regex /${rawPat}/`,
        features,
        needsMultiline: startOfLineHint || endOfLineHint || /(?:^|[^\\[\]])\^|\$(?:$|[^\\])/.test(pat),
        needsCaseInsensitive: false,
        hasCaptureGroups: /\([^?]/.test(pat)
      };
    }
  }

  // 4. Try Inside / Between Delimiters (e.g., "text inside HTML tags", "text inside parentheses", "quoted text")
  const insideResolved = tryResolveInsideOrBetween(cleaned, quotes);
  if (insideResolved) {
    return insideResolved;
  }

  // 5. Try Negated Character Classes (e.g., "characters that are NOT alphanumeric, spaces, or underscores")
  const negatedResolved = tryResolveNegatedCharClass(cleaned, quotes, quantifier);
  if (negatedResolved) {
    if (context?.locationHint === 'middle-of-word') {
      negatedResolved.pattern = `\\B${negatedResolved.pattern}\\B`;
      negatedResolved.features.unshift('Non-word boundary anchor (\\B)');
    }
    return negatedResolved;
  }

  // 6. Try Explicit Character Ranges ("letters from a to m", "digits from 1 to 5")
  const rangeResolved = tryResolveCharacterRange(cleaned, quantifier);
  if (rangeResolved) {
    return rangeResolved;
  }

  // 7. Try Affix / Line Filter ("words starting with X", "lines containing X", "bracket blocks containing X")
  const affixResolved = tryResolveAffixOrLineFilter(cleaned, quotes);
  if (affixResolved) {
    return affixResolved;
  }

  // 7.5. Try Delimited Block ("quotation mark blocks", "bracket blocks", "brace blocks", "paren blocks", "blocks")
  const blockResolved = tryResolveBlock(cleaned, quotes);
  if (blockResolved) {
    const features = [...blockResolved.features, ...quantFeatures];
    let pat = quantifier ? `(?:${blockResolved.pattern})${quantifier}` : blockResolved.pattern;
    pat = finalizeLineAnchors(pat, startOfLineHint, endOfLineHint, features);
    return {
      ...blockResolved,
      pattern: pat,
      features,
      needsMultiline: blockResolved.needsMultiline || startOfLineHint || endOfLineHint
    };
  }

  // 8. Try Alternation or US/UK Spelling Variant
  const variantResolved = tryResolveAlternationOrVariant(cleaned, quotes, effectiveWholeWord, quantifier);
  if (variantResolved) {
    return variantResolved;
  }

  // 9a. Check Lexicon Exact Match first
  let lexiconEntry = findLexiconEntry(cleaned);

  // 9b. Before keywordMatcher fallback, check if the user wrote an inline raw regex or character class directly
  if (!lexiconEntry) {
    const unmaskedCandidate = unmaskQuotes(cleaned, quotes).trim();
    const slashDelimMatch = unmaskedCandidate.match(/^\/(.+)\/$/);
    const directRegexStr =
      slashDelimMatch && isValidRegex(slashDelimMatch[1])
        ? slashDelimMatch[1]
        : isUnquotedRawRegex(unmaskedCandidate)
          ? unmaskedCandidate
          : null;

    if (directRegexStr) {
      const isAtomic = /^(\\[dwsDWS]|\\.|[^\\[\]()|+?*{}]|\[[^\]]+\])$/.test(directRegexStr);
      let pat = quantifier
        ? isAtomic
          ? `${directRegexStr}${quantifier}`
          : `(?:${directRegexStr})${quantifier}`
        : directRegexStr;
      if (context?.locationHint === 'middle-of-word' && !pat.startsWith('\\B')) {
        pat = `\\B${pat}\\B`;
      }
      const features = [`Direct regular expression (${pat})`, ...quantFeatures];
      pat = finalizeLineAnchors(pat, startOfLineHint, endOfLineHint, features);
      return {
        pattern: pat,
        label: `regex /${directRegexStr}/`,
        features,
        needsMultiline: startOfLineHint || endOfLineHint || /(?:^|[^\\[\]])\^|\$(?:$|[^\\])/.test(pat),
        needsCaseInsensitive: false,
        hasCaptureGroups: /\([^?]/.test(pat)
      };
    }

    for (const entry of LEXICON_ENTRIES) {
      if (entry.keywordMatcher && entry.keywordMatcher.test(cleaned)) {
        lexiconEntry = entry;
        break;
      }
    }
  }

  if (lexiconEntry) {
    const features = [...lexiconEntry.features, ...quantFeatures];
    let pat: string;

    if (lexiconEntry.id === 'numbers' && context?.hasCurrencyLookbehind && !quantifier) {
      // Example #10: numbers preceded by dollar sign -> \d+(?:\.\d{2})?
      pat = '\\d+(?:\\.\\d{2})?';
      features.push('Non-capturing decimal group ((?:\\.\\d{2})?)');
    } else if (quantifier) {
      pat = `${lexiconEntry.singleUnitPattern}${quantifier}`;
    } else if (quantExtract.isSingleUnitRequest) {
      pat = lexiconEntry.singleUnitPattern;
    } else {
      pat = lexiconEntry.findPattern;
    }

    if (effectiveWholeWord && lexiconEntry.supportsWordBoundary && !pat.startsWith('\\b')) {
      pat = `\\b${pat}\\b`;
      if (!features.some((f) => f.includes('\\b'))) {
        features.push('Word boundary anchor (\\b)');
      }
    }

    if (context?.locationHint === 'middle-of-word' && !pat.startsWith('\\B')) {
      pat = `\\B${pat}\\B`;
      features.unshift('Non-word boundary anchor (\\B)');
    }

    pat = finalizeLineAnchors(pat, startOfLineHint, endOfLineHint, features);

    return {
      pattern: pat,
      label: lexiconEntry.label,
      features,
      needsMultiline: Boolean(lexiconEntry.needsMultiline || startOfLineHint || endOfLineHint),
      needsCaseInsensitive: lexiconEntry.id === 'duplicate-words',
      defaultReplace: lexiconEntry.replaceLiteral,
      lexiconId: lexiconEntry.id,
      isWholeLine: lexiconEntry.id === 'non-empty-lines' || lexiconEntry.id === 'blank-lines',
      hasCaptureGroups: /\([^?]/.test(pat)
    };
  }

  // 10. Forgiving Unquoted Literal Fallback!
  // If the token is not a lexicon keyword, treat it as a literal word, character, or string.
  const unmaskedLiteral = unmaskQuotes(cleaned, quotes).trim();
  const escapedLiteral = escapeRegexLiteral(unmaskedLiteral);
  const features = [...quantFeatures];

  let finalPattern = quantifier
    ? escapedLiteral.length === 1
      ? `${escapedLiteral}${quantifier}`
      : `(?:${escapedLiteral})${quantifier}`
    : escapedLiteral;

  if (effectiveWholeWord && /^\w+$/.test(unmaskedLiteral)) {
    finalPattern = `\\b${finalPattern}\\b`;
    features.push('Word boundary anchor (\\b)');
  } else {
    features.push(`Literal pattern (${finalPattern})`);
  }

  if (context?.locationHint === 'middle-of-word' && !finalPattern.startsWith('\\B')) {
    finalPattern = `\\B${finalPattern}\\B`;
    features.unshift('Non-word boundary anchor (\\B)');
  }

  finalPattern = finalizeLineAnchors(finalPattern, startOfLineHint, endOfLineHint, features);

  return {
    pattern: finalPattern,
    label: `'${unmaskedLiteral}'`,
    features,
    needsMultiline: startOfLineHint || endOfLineHint,
    needsCaseInsensitive: false
  };
}

function finalizeLineAnchors(
  pattern: string,
  startOfLine: boolean,
  endOfLine: boolean,
  features: string[]
): string {
  let res = pattern;
  if (startOfLine && !res.startsWith('^')) {
    res = `^${res}`;
    features.push('Start-of-line anchor (^) ');
  }
  if (endOfLine && !res.endsWith('$')) {
    res = `${res}$`;
    features.push('End-of-line anchor ($)');
  }
  return res;
}

/**
 * Resolves a replacement clause into a Boost/VS Code replacement string.
 * Supports:
 * - Quoted literals ("Y") and backtick/tilde tokens (`\t`)
 * - Unquoted literals (Y, dog, 123) and escape sequences (\t\t, \n)
 * - Character class / symbol names (tabs -> \t, slashes -> /, newlines -> \n, spaces -> ' ', nothing -> '')
 * - Quantified replacement tokens ("4 spaces" -> '    ', "2 newlines" -> '\n\n')
 * - Structural conversions (Markdown links -> HTML links <a href="$2">$1</a>)
 */
export function resolveReplacementClause(
  rawReplacementClause: string,
  quotes: string[],
  resolvedTarget?: ResolvedTarget
): { replace: string; features: string[] } {
  const raw = rawReplacementClause.trim();
  const features: string[] = [];

  if (!raw || /^(?:nothing|empty|empty[\s_]+string|blanks?|none|null)$/i.test(raw)) {
    return { replace: '', features: ['Empty replacement (deletion)'] };
  }

  // 1. Check if single quoted or backtick/tilde token (__Q0__ or __R0__)
  const singleQuoteMatch = raw.match(/^__[QR](\d+)__$/);
  if (singleQuoteMatch) {
    const val = quotes[parseInt(singleQuoteMatch[1], 10)];
    if (val.includes('\\t')) features.push('Tab escape sequence (\\t)');
    if (val.includes('\\n')) features.push('Newline escape sequence (\\n)');
    return { replace: val, features };
  }

  // 2. Structural conversions (Example #19: Markdown links -> HTML links)
  const unmaskedFull = unmaskQuotes(raw, quotes).trim();
  if (
    resolvedTarget?.lexiconId === 'markdown-links' &&
    /\b(?:html[\s_]+links?|anchor[\s_]+tags?|<a\b)/i.test(unmaskedFull)
  ) {
    return {
      replace: '<a href="$2">$1</a>',
      features: ['Positional capture group references ($2, $1)']
    };
  }

  if (
    resolvedTarget?.lexiconId === 'urls' &&
    /\b(?:html[\s_]+(?:anchors?|links?)|anchor[\s_]+tags?|<a\b)/i.test(unmaskedFull)
  ) {
    return {
      replace: '<a href="$&">$&</a>',
      features: ['Whole-match replacement token ($&)']
    };
  }

  // 3. Check quantified replacement e.g. "4 spaces", "two tabs", "2 newlines"
  const numPattern = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten)';
  const quantRepMatch = raw.match(new RegExp(`^(${numPattern})\\s+(.+)$`, 'i'));
  if (quantRepMatch) {
    const count = parseNumberToken(quantRepMatch[1]);
    const unitClean = stripDeterminersAndClassifiers(quantRepMatch[2]).cleaned;
    const entry = findLexiconEntry(unitClean);
    if (count !== null && count >= 1 && count <= 20 && entry?.replaceLiteral !== undefined) {
      return {
        replace: entry.replaceLiteral.repeat(count),
        features: entry.features
      };
    }
  }

  // 4. Strip leading articles ("a tab" -> "tab", "a single space" -> "single space" -> "space")
  const { cleaned } = stripDeterminersAndClassifiers(raw);

  // Check again if stripping "the word 'dog'" left a single quote or raw token
  const strippedQuoteMatch = cleaned.match(/^__[QR](\d+)__$/);
  if (strippedQuoteMatch) {
    const val = quotes[parseInt(strippedQuoteMatch[1], 10)];
    if (val.includes('\\t')) features.push('Tab escape sequence (\\t)');
    if (val.includes('\\n')) features.push('Newline escape sequence (\\n)');
    return { replace: val, features };
  }

  // 5. Check Lexicon for replacement literal (e.g., tabs -> \t, slashes -> /, commas -> ,)
  const entry = findLexiconEntry(cleaned);
  if (entry && entry.replaceLiteral !== undefined) {
    if (entry.replaceLiteral === '\\t') features.push('Tab escape sequence (\\t)');
    else if (entry.replaceLiteral === '\\n') features.push('Newline escape sequence (\\n)');
    return { replace: entry.replaceLiteral, features };
  }

  // 6. Forgiving Unquoted Literal / Escape Sequence Fallback
  const unmasked = unmaskQuotes(cleaned, quotes).trim();
  if (unmasked.includes('\\t')) features.push('Tab escape sequence (\\t)');
  if (unmasked.includes('\\n')) features.push('Newline escape sequence (\\n)');
  if (/\$(\d+|&|<[^>]+>)/.test(unmasked)) features.push('Capture group backreference ($1 / $&)');
  return { replace: unmasked, features };
}
