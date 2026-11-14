import { escapeCharClassLiteral, escapeRegexLiteral, unmaskQuotes } from '../grammar/tokens';
import { findLexiconEntry } from '../lexicon';
import { stripDeterminersAndClassifiers } from './determinerStripper';
import { isUnquotedRawRegex, isValidRegex } from './directRegexResolver';

export function resolveRawLiteralOrCharClass(phrase: string, quotes: string[]): string {
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
