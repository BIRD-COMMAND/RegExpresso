import { ResolvedTarget } from '../types';
import { escapeRegexLiteral, isAtomicRegexUnit, unmaskQuotes } from '../grammar/tokens';
import { findLexiconEntry } from '../lexicon';
import { finalizeLineAnchors } from './determinerStripper';

export function isValidRegex(pattern: string): boolean {
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
export function isUnquotedRawRegex(token: string): boolean {
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
  if (
    /\((?:\?:|\?=|\?!|\?<=|\?<!|[^)]*[\\[\].*+?|^$][^)]*)\)/.test(s) ||
    /^\([^()\s]+\)[+*?]?$/.test(s)
  ) {
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

/**
 * Resolves a single quoted literal (`__Q0__`) or raw regex token (`__R0__` from backticks/tildes).
 */
export function tryResolveMaskedToken(
  cleaned: string,
  quotes: string[],
  quantifier: string,
  quantFeatures: string[],
  effectiveWholeWord: boolean,
  startOfLineHint: boolean,
  endOfLineHint: boolean
): ResolvedTarget | null {
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

  const rawRegexTokenMatch = cleaned.match(/^__R(\d+)__$/);
  if (rawRegexTokenMatch) {
    const rawPat = quotes[parseInt(rawRegexTokenMatch[1], 10)].trim();
    const isPlainLexiconName = /^[a-zA-Z_ -]+$/.test(rawPat) && Boolean(findLexiconEntry(rawPat));
    if (!isPlainLexiconName && isValidRegex(rawPat)) {
      const isAtomic = isAtomicRegexUnit(rawPat);
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
        needsMultiline:
          startOfLineHint || endOfLineHint || /(?:^|[^\\[\]])\^|\$(?:$|[^\\])/.test(pat),
        needsCaseInsensitive: false,
        hasCaptureGroups: /\([^?]/.test(pat)
      };
    }
  }

  return null;
}

/**
 * Resolves an unquoted inline regular expression or `/.../` slash-delimited regex.
 */
export function tryResolveUnquotedDirectRegex(
  cleaned: string,
  quotes: string[],
  quantifier: string,
  quantFeatures: string[],
  startOfLineHint: boolean,
  endOfLineHint: boolean,
  locationHint?: string
): ResolvedTarget | null {
  const unmaskedCandidate = unmaskQuotes(cleaned, quotes).trim();
  const slashDelimMatch = unmaskedCandidate.match(/^\/(.+)\/$/);
  const directRegexStr =
    slashDelimMatch && isValidRegex(slashDelimMatch[1])
      ? slashDelimMatch[1]
      : isUnquotedRawRegex(unmaskedCandidate)
        ? unmaskedCandidate
        : null;

  if (!directRegexStr) {
    return null;
  }

  const isAtomic = isAtomicRegexUnit(directRegexStr);
  let pat = quantifier
    ? isAtomic
      ? `${directRegexStr}${quantifier}`
      : `(?:${directRegexStr})${quantifier}`
    : directRegexStr;
  if (locationHint === 'middle-of-word' && !pat.startsWith('\\B')) {
    pat = `\\B${pat}\\B`;
  }
  const features = [`Direct regular expression (${pat})`, ...quantFeatures];
  pat = finalizeLineAnchors(pat, startOfLineHint, endOfLineHint, features);
  return {
    pattern: pat,
    label: `regex /${directRegexStr}/`,
    features,
    needsMultiline:
      startOfLineHint || endOfLineHint || /(?:^|[^\\[\]])\^|\$(?:$|[^\\])/.test(pat),
    needsCaseInsensitive: false,
    hasCaptureGroups: /\([^?]/.test(pat)
  };
}
