import { ResolvedTarget } from '../types';
import { escapeCharClassLiteral, unmaskQuotes } from '../grammar/tokens';
import { findLexiconEntry } from '../lexicon';

/**
 * Resolves a negated character class description, e.g.:
 * "characters that are NOT alphanumeric, spaces, or underscores" -> [^\w\s]
 * "anything except digits" -> [^\d]+
 */
export function tryResolveNegatedCharClass(
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
    if (
      /^(?:alphanumeric(?:s|[\s_]+chars?|[\s_]+characters?)?|letters?[\s_]+and[\s_]+numbers?)$/i.test(
        part
      )
    ) {
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
export function tryResolveCharacterRange(
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
