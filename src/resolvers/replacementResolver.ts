import { ResolvedTarget } from '../types';
import { parseNumberToken, unmaskQuotes } from '../grammar/tokens';
import { findLexiconEntry } from '../lexicon';
import { stripDeterminersAndClassifiers } from './determinerStripper';

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
