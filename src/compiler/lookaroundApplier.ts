import { ParsedQuery } from '../types';
import { resolveDelimiterOrLiteral } from '../resolvers';

export function buildFlagsString(
  parsed: ParsedQuery,
  needsMultiline: boolean,
  needsCaseInsensitive: boolean
): string {
  let flags = 'g';
  if (parsed.flags.caseInsensitive || needsCaseInsensitive) {
    flags += 'i';
  }
  if (parsed.flags.multiline || needsMultiline) {
    flags += 'm';
  }
  return flags;
}

export function applyLookaroundsAndExclusions(
  basePattern: string,
  parsed: ParsedQuery,
  features: string[]
): string {
  let pattern = basePattern;

  for (const cond of parsed.conditions) {
    const delim = resolveDelimiterOrLiteral(cond.targetPhrase, parsed.quotes);
    switch (cond.type) {
      case 'preceded-by':
        pattern = `(?<=${delim})${pattern}`;
        features.push(`Positive lookbehind ((?<=${delim}))`);
        break;
      case 'not-preceded-by':
        pattern = `(?<!${delim})${pattern}`;
        features.push(`Negative lookbehind ((?<!${delim}))`);
        break;
      case 'followed-by':
        pattern = `${pattern}(?=${delim})`;
        features.push(`Positive lookahead ((?=${delim}))`);
        break;
      case 'not-followed-by': {
        const useSpacePrefix = delim === '[:=]';
        const lookaheadBody = useSpacePrefix ? `\\s*${delim}` : delim;
        pattern = `${pattern}(?!${lookaheadBody})`;
        features.push(`Negative lookahead ((?!${lookaheadBody}))`);
        break;
      }
    }
  }

  if (parsed.exclusionClause) {
    if (/\b(?:iso|hyphen|dash|\d{4}-\d{2}-\d{2}|dates?)\b/i.test(parsed.exclusionClause)) {
      pattern = `(?<!-)${pattern}(?!-)`;
      features.push('Negative lookbehind ((?<!-))', 'Negative lookahead ((?!-))');
    } else {
      const excl = resolveDelimiterOrLiteral(parsed.exclusionClause, parsed.quotes);
      pattern = `${pattern}(?!${excl})`;
      features.push(`Negative lookahead ((?!${excl}))`);
    }
  }

  return pattern;
}
