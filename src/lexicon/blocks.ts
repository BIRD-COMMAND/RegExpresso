import { escapeCharClassLiteral, escapeRegexLiteral, unmaskQuotes } from '../grammar/tokens';
import { BlockSpec, LexiconEntry } from './types';

export function resolveBlockSpec(
  rawDelimPhrase: string,
  quotes: string[],
  lookupLexiconEntry: (phrase: string) => LexiconEntry | null
): BlockSpec | null {
  const delim = unmaskQuotes(rawDelimPhrase, quotes)
    .trim()
    .replace(/^(?:(?:the|all|each|every|any|matching|paired)\s+)+/i, '')
    .trim();

  if (
    /^(?:double[-\s_]?(?:quotes?|quot(?:ation|ed?)[\s_]+marks?|quotations?|quoted)|")$/i.test(
      delim
    )
  ) {
    return {
      pattern: '"[^"\\r\\n]*"',
      open: '"',
      close: '"',
      negatedInnerChar: '"\\r\\n',
      label: 'double-quote blocks',
      features: ['Double-quote block ("[^"\\r\\n]*")']
    };
  }

  if (
    /^(?:single[-\s_]?(?:quotes?|quot(?:ation|ed?)[\s_]+marks?|quotations?|quoted)|apostrophes?|')$/i.test(
      delim
    )
  ) {
    return {
      pattern: "'[^'\\r\\n]*'",
      open: "'",
      close: "'",
      negatedInnerChar: "'\\r\\n",
      label: 'single-quote blocks',
      features: ["Single-quote block ('[^'\\r\\n]*')"]
    };
  }

  if (
    /^(?:back[-\s_]?ticks?|back[-\s_]?quotes?|grave[\s_]+accents?|graves?|back[-\s_]?ticked|`)$/i.test(
      delim
    )
  ) {
    return {
      pattern: '`[^`\\r\\n]*`',
      open: '`',
      close: '`',
      negatedInnerChar: '`\\r\\n',
      label: 'backtick blocks',
      features: ['Backtick block (`[^`\\r\\n]*`)']
    };
  }

  if (
    /^(?:quotes?|quot(?:ation|ed?)[\s_]+marks?|quotations?|quoted|strings?|quoted[\s_]+strings?)$/i.test(
      delim
    )
  ) {
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

  if (
    /^(?:parentheses|parenthesis|parens?|parenthetical|parenthesized|round(?:ed)?[\s_]+brackets?|\(\s*\)|\\?[()])$/i.test(
      delim
    )
  ) {
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

  if (
    /^(?:angle[\s_]+brackets?|angles?|angle[-\s_]bracketed|chevrons?|html[\s_]+tag(?:s|ged)?|xml[\s_]+tag(?:s|ged)?|tags?|<\s*>|\\?[<>])$/i.test(
      delim
    )
  ) {
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
  const entry = lookupLexiconEntry(delim);
  const sym = entry?.replaceLiteral ?? (delim.length === 1 ? delim : undefined);
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
