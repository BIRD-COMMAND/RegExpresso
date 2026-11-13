export function escapeRegexLiteral(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeCharClassLiteral(literal: string): string {
  return literal.replace(/[\\\]^-]/g, '\\$&');
}

export const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  a: 1,
  an: 1,
  single: 1,
  two: 2,
  couple: 2,
  pair: 2,
  double: 2,
  both: 2,
  three: 3,
  triple: 3,
  four: 4,
  quadruple: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  hundred: 100
};

export function parseNumberToken(token: string): number | null {
  const clean = token.trim().toLowerCase();
  if (/^\d+$/.test(clean)) {
    return parseInt(clean, 10);
  }
  return WORD_NUMBERS[clean] ?? null;
}

export interface LexiconEntry {
  id: string;
  label: string;
  /** Regex matching the normalized phrase when the entire phrase is this entity */
  exactMatcher: RegExp;
  /** Regex matching the entity inside a larger phrase */
  keywordMatcher?: RegExp;
  /** Default pattern when used in a Find slot without explicit quantifier */
  findPattern: string;
  /** Atomic unit pattern to which explicit quantifiers like {3,5} or + attach */
  singleUnitPattern: string;
  /** Characters to place inside [...] or [^...] when combining into a character class */
  charClassChars?: string;
  /** Concrete replacement string when used in a Replace slot */
  replaceLiteral?: string;
  /** Whether multiline flag 'm' should be enabled */
  needsMultiline?: boolean;
  /** Whether word boundaries \b...\b are appropriate when bounded */
  supportsWordBoundary?: boolean;
  /** Features description */
  features: string[];
}

export const LEXICON_ENTRIES: LexiconEntry[] = [
  // =========================================================================
  // 1. LINE & MULTI-LINE STRUCTURES
  // =========================================================================
  {
    id: 'blank-lines',
    label: 'blank/empty lines',
    exactMatcher: /^(?:all\s+)?(?:the\s+)?(?:blank|empty|whitespace-only|white-space-only)\s+lines?$/i,
    keywordMatcher: /\b(?:blank|empty|whitespace-only)\s+lines?\b/i,
    findPattern: '^\\s*\\n',
    singleUnitPattern: '^\\s*\\n',
    replaceLiteral: '\n',
    needsMultiline: true,
    features: ['Line anchor (^)', 'Whitespace shorthand (\\s*)', 'Newline (\\n)']
  },
  {
    id: 'duplicate-lines',
    label: 'consecutive duplicate lines',
    exactMatcher: /^(?:consecutive\s+|adjacent\s+)?(?:duplicate|repeated|identical)\s+lines?$/i,
    keywordMatcher: /\b(?:consecutive\s+|adjacent\s+)?(?:duplicate|repeated)\s+lines?\b/i,
    findPattern: '^(.*)(\\r?\\n\\1)+$',
    singleUnitPattern: '^(.*)(\\r?\\n\\1)+$',
    replaceLiteral: '$1',
    needsMultiline: true,
    features: ['Line capture (^(.*)$)', 'Backreference (\\1)', 'Multiline anchors']
  },
  {
    id: 'duplicate-words',
    label: 'consecutive duplicate words',
    exactMatcher: /^(?:consecutive\s+|adjacent\s+)?(?:duplicate|repeated|doubled)\s+words?$/i,
    keywordMatcher: /\b(?:duplicate|repeated|doubled)\s+words?\b|\bwords?\s+(?:that\s+(?:is|are)\s+)?(?:accidentally\s+)?(?:typed|written|repeated|duplicated)\s+twice(?:\s+in\s+a\s+row)?\b/i,
    findPattern: '\\b([a-zA-Z]+)\\s+\\1\\b',
    singleUnitPattern: '\\b([a-zA-Z]+)\\s+\\1\\b',
    replaceLiteral: '$1',
    features: ['Search backreference (\\1)', 'Character range ([a-zA-Z]+)', 'Word boundary (\\b)']
  },
  {
    id: 'non-empty-lines',
    label: 'non-empty lines / column items',
    exactMatcher: /^(?:every\s+|each\s+|all\s+)?(?:non-empty\s+)?(?:lines?|rows?|items?(?:\s+in\s+this\s+(?:column|list|file))?|entries|records)$/i,
    findPattern: '^(.+)$',
    singleUnitPattern: '^(.+)$',
    needsMultiline: true,
    features: ['Full-line capture (^(.+)$)', 'One-or-more quantifier (+)']
  },

  // =========================================================================
  // 2. WHITESPACE & LINE BREAKS
  // =========================================================================
  {
    id: 'leading-and-trailing-whitespace',
    label: 'leading and trailing whitespace',
    exactMatcher: /^(?:leading\s+(?:and|or)\s+trailing\s+(?:whitespace|spaces?|tabs?)|(?:whitespace|spaces?)\s+at\s+(?:the\s+)?(?:start|beginning)\s+and\s+end\s+of\s+(?:every\s+|each\s+|the\s+)?lines?)$/i,
    keywordMatcher: /\bleading\s+(?:and|or)\s+trailing\s+(?:whitespace|spaces?|tabs?)\b/i,
    findPattern: '^[ \\t]+|[ \\t]+$',
    singleUnitPattern: '[ \\t]',
    replaceLiteral: '',
    needsMultiline: true,
    features: ['Line anchors (^, $)', 'Alternation (|)', 'Horizontal whitespace ([ \\t]+)']
  },
  {
    id: 'leading-whitespace',
    label: 'leading whitespace / indentation',
    exactMatcher: /^(?:leading\s+(?:whitespace|spaces?|tabs?)|indentation|indentations|spaces?\s+at\s+(?:the\s+)?(?:start|beginning)\s+of\s+(?:every\s+|each\s+|the\s+)?lines?)$/i,
    keywordMatcher: /\b(?:leading\s+(?:whitespace|spaces?|tabs?)|indentation)\b/i,
    findPattern: '^[ \\t]+',
    singleUnitPattern: '[ \\t]',
    replaceLiteral: '',
    needsMultiline: true,
    features: ['Line start anchor (^)', 'Horizontal whitespace ([ \\t]+)']
  },
  {
    id: 'trailing-whitespace',
    label: 'trailing whitespace',
    exactMatcher: /^(?:trailing\s+(?:whitespace|spaces?|tabs?)|(?:whitespace|spaces?|tabs?)\s+at\s+(?:the\s+)?end\s+of\s+(?:every\s+|each\s+|the\s+)?lines?)$/i,
    keywordMatcher: /\btrailing\s+(?:whitespace|spaces?|tabs?)\b/i,
    findPattern: '[ \\t]+$',
    singleUnitPattern: '[ \\t]',
    replaceLiteral: '',
    needsMultiline: true,
    features: ['Line end anchor ($)', 'Horizontal whitespace ([ \\t]+)']
  },
  {
    id: 'multiple-spaces',
    label: 'multiple consecutive spaces',
    exactMatcher: /^(?:multiple|extra|consecutive|double|two\s+or\s+more|duplicate|redundant)\s+(?:spaces|whitespace)$/i,
    keywordMatcher: /\b(?:multiple|extra|consecutive|double|redundant)\s+spaces\b/i,
    findPattern: ' {2,}',
    singleUnitPattern: ' ',
    replaceLiteral: ' ',
    features: ['Lower-bound quantifier ({2,})']
  },
  {
    id: 'tabs',
    label: 'tabs',
    exactMatcher: /^(?:tabs?|tab\s+characters?|tab\s+stops?|\\t)$/i,
    keywordMatcher: /\b(?:tabs?|tab\s+characters?)\b/i,
    findPattern: '\\t',
    singleUnitPattern: '\\t',
    charClassChars: '\\t',
    replaceLiteral: '\\t',
    features: ['Tab escape (\\t)']
  },
  {
    id: 'newlines',
    label: 'newlines / line breaks',
    exactMatcher: /^(?:newlines?|new\s+lines?|line\s*breaks?|carriage\s+returns?|crlf|lf|\\n|\\r\\n)$/i,
    keywordMatcher: /\b(?:newlines?|new\s+lines?|line\s*breaks?)\b/i,
    findPattern: '\\r?\\n',
    singleUnitPattern: '\\r?\\n',
    charClassChars: '\\r\\n',
    replaceLiteral: '\\n',
    features: ['Newline sequence (\\r?\\n)']
  },
  {
    id: 'horizontal-whitespace',
    label: 'spaces or tabs (horizontal whitespace)',
    exactMatcher: /^(?:horizontal\s+whitespace|spaces?\s+(?:and|or)\s+tabs?|tabs?\s+(?:and|or)\s+spaces?)$/i,
    findPattern: '[ \\t]+',
    singleUnitPattern: '[ \\t]',
    charClassChars: ' \\t',
    replaceLiteral: ' ',
    features: ['Horizontal whitespace class ([ \\t]+)']
  },
  {
    id: 'spaces',
    label: 'spaces',
    exactMatcher: /^(?:spaces?|space\s+characters?|blank\s+spaces?|single\s+spaces?)$/i,
    keywordMatcher: /\b(?:spaces?|space\s+characters?|blank\s+spaces?)\b/i,
    findPattern: ' +',
    singleUnitPattern: ' ',
    charClassChars: ' ',
    replaceLiteral: ' ',
    features: ['Space match ( +)']
  },
  {
    id: 'whitespace',
    label: 'whitespace',
    exactMatcher: /^(?:whitespace|whitespaces|white\s+space|whitespace\s+characters?|any\s+whitespace|\\s)$/i,
    keywordMatcher: /\b(?:whitespace|white\s+space)\b/i,
    findPattern: '\\s+',
    singleUnitPattern: '\\s',
    charClassChars: '\\s',
    replaceLiteral: ' ',
    features: ['Whitespace shorthand (\\s+)']
  },
  {
    id: 'non-whitespace',
    label: 'non-whitespace characters',
    exactMatcher: /^(?:non-whitespace|non-space|non\s+whitespace|not\s+whitespace|not\s+spaces?|\\S)\s*(?:characters?|chars?|tokens?)?$/i,
    findPattern: '\\S+',
    singleUnitPattern: '\\S',
    charClassChars: '\\S',
    features: ['Negated whitespace shorthand (\\S+)']
  },

  // =========================================================================
  // 3. SLASHES, QUOTES, BRACKETS & PUNCTUATION SYMBOLS
  // =========================================================================
  {
    id: 'forward-slashes',
    label: 'forward slashes',
    exactMatcher: /^(?:forward\s+slash(?:es)?|fslash(?:es)?)$/i,
    keywordMatcher: /\bforward\s+slash(?:es)?\b/i,
    findPattern: '/',
    singleUnitPattern: '/',
    charClassChars: '/',
    replaceLiteral: '/',
    features: ['Forward slash literal (/)']
  },
  {
    id: 'backslashes',
    label: 'backslashes',
    exactMatcher: /^(?:backslash(?:es)?|back\s+slash(?:es)?|backward\s+slash(?:es)?)$/i,
    keywordMatcher: /\b(?:backslash(?:es)?|back\s+slash(?:es)?|backward\s+slash(?:es)?)\b/i,
    findPattern: '\\\\',
    singleUnitPattern: '\\\\',
    charClassChars: '\\\\',
    replaceLiteral: '\\\\',
    features: ['Escaped backslash (\\\\)']
  },
  {
    id: 'slashes',
    label: 'slashes',
    exactMatcher: /^(?:slash(?:es)?|any\s+slash(?:es)?|forward\s+(?:or|and)\s+back(?:ward)?\s*slash(?:es)?)$/i,
    keywordMatcher: /\bslash(?:es)?\b/i,
    findPattern: '[/\\\\]',
    singleUnitPattern: '[/\\\\]',
    charClassChars: '/\\\\',
    replaceLiteral: '/',
    features: ['Character class ([/\\\\])', 'Escaped backslash (\\\\)']
  },
  {
    id: 'double-quotes',
    label: 'double quotes',
    exactMatcher: /^(?:double\s+quotes?|double\s+quotation\s+marks?)$/i,
    keywordMatcher: /\b(?:double\s+quotes?|double\s+quotation\s+marks?)\b/i,
    findPattern: '"',
    singleUnitPattern: '"',
    charClassChars: '"',
    replaceLiteral: '"',
    features: ['Double quote literal (")']
  },
  {
    id: 'single-quotes',
    label: 'single quotes / apostrophes',
    exactMatcher: /^(?:single\s+quotes?|single\s+quotation\s+marks?|apostrophes?)$/i,
    keywordMatcher: /\b(?:single\s+quotes?|single\s+quotation\s+marks?|apostrophes?)\b/i,
    findPattern: "'",
    singleUnitPattern: "'",
    charClassChars: "'",
    replaceLiteral: "'",
    features: ["Single quote literal (')"]
  },
  {
    id: 'backticks',
    label: 'backticks',
    exactMatcher: /^(?:backticks?|back-ticks?|grave\s+accents?|graves?)$/i,
    keywordMatcher: /\b(?:backticks?|grave\s+accents?)\b/i,
    findPattern: '`',
    singleUnitPattern: '`',
    charClassChars: '`',
    replaceLiteral: '`',
    features: ['Backtick literal (`)']
  },
  {
    id: 'smart-quotes',
    label: 'smart / curly quotes',
    exactMatcher: /^(?:smart\s+quotes?|curly\s+quotes?|fancy\s+quotes?)$/i,
    keywordMatcher: /\b(?:smart|curly|fancy)\s+quotes?\b/i,
    findPattern: '[“”‘’]',
    singleUnitPattern: '[“”‘’]',
    charClassChars: '“”‘’',
    replaceLiteral: '"',
    features: ['Character class ([“”‘’])']
  },
  {
    id: 'empty-strings',
    label: 'empty strings / empty quotations',
    exactMatcher: /^(?:empty\s+(?:strings?|quotations?))$/i,
    keywordMatcher: /\bempty\s+(?:strings?|quotations?)\b/i,
    findPattern: '(?:""|\'\')',
    singleUnitPattern: '(?:""|\'\')',
    replaceLiteral: '""',
    features: ['Empty string alternation ((?:""|\'\'))']
  },
  {
    id: 'double-quoted-strings',
    label: 'double-quoted strings',
    exactMatcher: /^(?:double[- ]quoted\s+(?:strings?|text|quotations?|literals?))$/i,
    keywordMatcher: /\bdouble[- ]quoted\s+(?:strings?|text|quotations?)\b/i,
    findPattern: '"[^"\\r\\n]*"',
    singleUnitPattern: '"[^"\\r\\n]*"',
    features: ['Double-quoted string ("[^"\\r\\n]*")']
  },
  {
    id: 'single-quoted-strings',
    label: 'single-quoted strings',
    exactMatcher: /^(?:single[- ]quoted\s+(?:strings?|text|quotations?|literals?))$/i,
    keywordMatcher: /\bsingle[- ]quoted\s+(?:strings?|text|quotations?)\b/i,
    findPattern: "'[^'\\r\\n]*'",
    singleUnitPattern: "'[^'\\r\\n]*'",
    features: ["Single-quoted string ('[^'\\r\\n]*')"]
  },
  {
    id: 'strings',
    label: 'quoted strings / quotations (including quote marks)',
    exactMatcher: /^(?:strings?|quotations?|quoted\s+(?:strings?|text|words?|values?|items?)|string\s+literals?)$/i,
    keywordMatcher: /\b(?:strings?|quotations?|quoted\s+strings?|string\s+literals?)\b/i,
    findPattern: '(?:"[^"\\r\\n]*"|\'[^\'\\r\\n]*\')',
    singleUnitPattern: '(?:"[^"\\r\\n]*"|\'[^\'\\r\\n]*\')',
    features: ['Quoted string alternation ((?:"[^"\\r\\n]*"|\'[^\'\\r\\n]*\'))']
  },
  {
    id: 'quotes',
    label: 'quotes / quotation marks',
    exactMatcher: /^(?:quotes?|quotation\s+marks?|quote\s+marks?|quote\s+characters?)$/i,
    keywordMatcher: /\b(?:quotes?|quotation\s+marks?|quote\s+marks?)\b/i,
    findPattern: '["\']',
    singleUnitPattern: '["\']',
    charClassChars: '"\'',
    replaceLiteral: '"',
    features: ['Quote character class (["\'])']
  },
  {
    id: 'periods',
    label: 'periods / dots',
    exactMatcher: /^(?:periods?|dots?|full\s+stops?|decimal\s+points?)$/i,
    keywordMatcher: /\b(?:periods?|dots?|full\s+stops?)\b/i,
    findPattern: '\\.',
    singleUnitPattern: '\\.',
    charClassChars: '.',
    replaceLiteral: '.',
    features: ['Escaped period (\\.)']
  },
  {
    id: 'commas',
    label: 'commas',
    exactMatcher: /^(?:commas?|comma\s+characters?)$/i,
    keywordMatcher: /\bcommas?\b/i,
    findPattern: ',',
    singleUnitPattern: ',',
    charClassChars: ',',
    replaceLiteral: ',',
    features: ['Literal comma (,)']
  },
  {
    id: 'semicolons',
    label: 'semicolons',
    exactMatcher: /^(?:semicolons?|semi-colons?)$/i,
    keywordMatcher: /\b(?:semicolons?|semi-colons?)\b/i,
    findPattern: ';',
    singleUnitPattern: ';',
    charClassChars: ';',
    replaceLiteral: ';',
    features: ['Literal semicolon (;)']
  },
  {
    id: 'colons',
    label: 'colons',
    exactMatcher: /^(?:colons?|colon\s+characters?)$/i,
    keywordMatcher: /\bcolons?\b/i,
    findPattern: ':',
    singleUnitPattern: ':',
    charClassChars: ':',
    replaceLiteral: ':',
    features: ['Literal colon (:)']
  },
  {
    id: 'underscores',
    label: 'underscores',
    exactMatcher: /^(?:underscores?|underbars?)$/i,
    keywordMatcher: /\bunderscores?\b/i,
    findPattern: '_',
    singleUnitPattern: '_',
    charClassChars: '_',
    replaceLiteral: '_',
    features: ['Literal underscore (_)']
  },
  {
    id: 'hyphens',
    label: 'hyphens / dashes',
    exactMatcher: /^(?:hyphens?|dashes|dash|minus\s+signs?|minuses)$/i,
    keywordMatcher: /\b(?:hyphens?|dashes|dash|minus\s+signs?)\b/i,
    findPattern: '-',
    singleUnitPattern: '-',
    charClassChars: '\\-',
    replaceLiteral: '-',
    features: ['Literal hyphen (-)']
  },
  {
    id: 'parentheses',
    label: 'parentheses',
    exactMatcher: /^(?:parentheses|parenthesis|parens?|round\s+brackets?)$/i,
    keywordMatcher: /\b(?:parentheses|parenthesis|parens?|round\s+brackets?)\b/i,
    findPattern: '[()]',
    singleUnitPattern: '[()]',
    charClassChars: '()',
    replaceLiteral: '()',
    features: ['Character class ([()])']
  },
  {
    id: 'open-paren',
    label: 'opening parenthesis',
    exactMatcher: /^(?:open(?:ing)?\s+(?:parenthesis|paren)|left\s+(?:parenthesis|paren))$/i,
    findPattern: '\\(',
    singleUnitPattern: '\\(',
    charClassChars: '(',
    replaceLiteral: '(',
    features: ['Escaped parenthesis (\\()']
  },
  {
    id: 'close-paren',
    label: 'closing parenthesis',
    exactMatcher: /^(?:clos(?:e|ing)\s+(?:parenthesis|paren)|right\s+(?:parenthesis|paren))$/i,
    findPattern: '\\)',
    singleUnitPattern: '\\)',
    charClassChars: ')',
    replaceLiteral: ')',
    features: ['Escaped parenthesis (\\))']
  },
  {
    id: 'brackets',
    label: 'square brackets',
    exactMatcher: /^(?:(?:square\s+)?brackets?)$/i,
    keywordMatcher: /\b(?:square\s+)?brackets?\b/i,
    findPattern: '[\\[\\]]',
    singleUnitPattern: '[\\[\\]]',
    charClassChars: '\\[\\]',
    replaceLiteral: '[]',
    features: ['Escaped bracket class ([\\[\\]])']
  },
  {
    id: 'open-bracket',
    label: 'opening bracket',
    exactMatcher: /^(?:open(?:ing)?\s+(?:square\s+)?bracket|left\s+(?:square\s+)?bracket)$/i,
    findPattern: '\\[',
    singleUnitPattern: '\\[',
    charClassChars: '\\[',
    replaceLiteral: '[',
    features: ['Escaped bracket (\\[)']
  },
  {
    id: 'close-bracket',
    label: 'closing bracket',
    exactMatcher: /^(?:clos(?:e|ing)\s+(?:square\s+)?bracket|right\s+(?:square\s+)?bracket)$/i,
    findPattern: '\\]',
    singleUnitPattern: '\\]',
    charClassChars: '\\]',
    replaceLiteral: ']',
    features: ['Escaped bracket (\\])']
  },
  {
    id: 'braces',
    label: 'curly braces',
    exactMatcher: /^(?:(?:curly\s+)?braces?|curly\s+brackets?)$/i,
    keywordMatcher: /\b(?:(?:curly\s+)?braces?|curly\s+brackets?)\b/i,
    findPattern: '[{}]',
    singleUnitPattern: '[{}]',
    charClassChars: '{}',
    replaceLiteral: '{}',
    features: ['Brace character class ([{}])']
  },
  {
    id: 'open-brace',
    label: 'opening curly brace',
    exactMatcher: /^(?:open(?:ing)?\s+(?:curly\s+)?brace|left\s+(?:curly\s+)?brace)$/i,
    findPattern: '\\{',
    singleUnitPattern: '\\{',
    charClassChars: '{',
    replaceLiteral: '{',
    features: ['Escaped brace (\\{)']
  },
  {
    id: 'close-brace',
    label: 'closing curly brace',
    exactMatcher: /^(?:clos(?:e|ing)\s+(?:curly\s+)?brace|right\s+(?:curly\s+)?brace)$/i,
    findPattern: '\\}',
    singleUnitPattern: '\\}',
    charClassChars: '}',
    replaceLiteral: '}',
    features: ['Escaped brace (\\})']
  },
  {
    id: 'angle-brackets',
    label: 'angle brackets',
    exactMatcher: /^(?:angle\s+brackets?|chevrons?)$/i,
    keywordMatcher: /\b(?:angle\s+brackets?|chevrons?)\b/i,
    findPattern: '[<>]',
    singleUnitPattern: '[<>]',
    charClassChars: '<>',
    replaceLiteral: '<>',
    features: ['Character class ([<>])']
  },
  {
    id: 'exclamation-marks',
    label: 'exclamation marks',
    exactMatcher: /^(?:exclamation\s+(?:marks?|points?)|exclamations?|bangs?)$/i,
    keywordMatcher: /\b(?:exclamation\s+(?:marks?|points?)|bangs?)\b/i,
    findPattern: '!',
    singleUnitPattern: '!',
    charClassChars: '!',
    replaceLiteral: '!',
    features: ['Exclamation literal (!)']
  },
  {
    id: 'question-marks',
    label: 'question marks',
    exactMatcher: /^(?:question\s+marks?)$/i,
    keywordMatcher: /\bquestion\s+marks?\b/i,
    findPattern: '\\?',
    singleUnitPattern: '\\?',
    charClassChars: '?',
    replaceLiteral: '?',
    features: ['Escaped question mark (\\?)']
  },
  {
    id: 'asterisks',
    label: 'asterisks / stars',
    exactMatcher: /^(?:asterisks?|stars?)$/i,
    keywordMatcher: /\b(?:asterisks?|stars?)\b/i,
    findPattern: '\\*',
    singleUnitPattern: '\\*',
    charClassChars: '*',
    replaceLiteral: '*',
    features: ['Escaped asterisk (\\*)']
  },
  {
    id: 'plus-signs',
    label: 'plus signs',
    exactMatcher: /^(?:plus\s+signs?|pluses|plus)$/i,
    keywordMatcher: /\bplus\s+signs?\b/i,
    findPattern: '\\+',
    singleUnitPattern: '\\+',
    charClassChars: '+',
    replaceLiteral: '+',
    features: ['Escaped plus sign (\\+)']
  },
  {
    id: 'equals-signs',
    label: 'equals signs',
    exactMatcher: /^(?:equals?\s+signs?|equals?)$/i,
    keywordMatcher: /\bequals?\s*(?:signs?)?\b/i,
    findPattern: '=',
    singleUnitPattern: '=',
    charClassChars: '=',
    replaceLiteral: '=',
    features: ['Equals literal (=)']
  },
  {
    id: 'hashes',
    label: 'hashes / pound signs',
    exactMatcher: /^(?:hashes|hash|hashtags?|pound\s+signs?|number\s+signs?|octothorpes?)$/i,
    keywordMatcher: /\b(?:hashes|hash|hashtags?|pound\s+signs?|octothorpes?)\b/i,
    findPattern: '#',
    singleUnitPattern: '#',
    charClassChars: '#',
    replaceLiteral: '#',
    features: ['Hash literal (#)']
  },
  {
    id: 'dollar-signs',
    label: 'dollar signs',
    exactMatcher: /^(?:dollar\s+signs?|dollars?)$/i,
    keywordMatcher: /\bdollar\s+signs?\b/i,
    findPattern: '\\$',
    singleUnitPattern: '\\$',
    charClassChars: '$',
    replaceLiteral: '$$',
    features: ['Escaped dollar sign (\\$)']
  },
  {
    id: 'percent-signs',
    label: 'percent signs',
    exactMatcher: /^(?:percent(?:age)?\s+signs?|percents?)$/i,
    keywordMatcher: /\bpercent(?:age)?\s+signs?\b/i,
    findPattern: '%',
    singleUnitPattern: '%',
    charClassChars: '%',
    replaceLiteral: '%',
    features: ['Percent literal (%)']
  },
  {
    id: 'ampersands',
    label: 'ampersands',
    exactMatcher: /^(?:ampersands?|and\s+signs?)$/i,
    keywordMatcher: /\bampersands?\b/i,
    findPattern: '&',
    singleUnitPattern: '&',
    charClassChars: '&',
    replaceLiteral: '&',
    features: ['Ampersand literal (&)']
  },
  {
    id: 'pipes',
    label: 'pipes / vertical bars',
    exactMatcher: /^(?:pipes?|vertical\s+bars?)$/i,
    keywordMatcher: /\b(?:pipes?|vertical\s+bars?)\b/i,
    findPattern: '\\|',
    singleUnitPattern: '\\|',
    charClassChars: '|',
    replaceLiteral: '|',
    features: ['Escaped pipe (\\|)']
  },
  {
    id: 'tildes',
    label: 'tildes',
    exactMatcher: /^(?:tildes?)$/i,
    keywordMatcher: /\btildes?\b/i,
    findPattern: '~',
    singleUnitPattern: '~',
    charClassChars: '~',
    replaceLiteral: '~',
    features: ['Tilde literal (~)']
  },
  {
    id: 'carets',
    label: 'caret symbols',
    exactMatcher: /^(?:carets?|caret\s+symbols?|circumflex(?:es)?)$/i,
    findPattern: '\\^',
    singleUnitPattern: '\\^',
    charClassChars: '\\^',
    replaceLiteral: '^',
    features: ['Escaped caret (\\^)']
  },
  {
    id: 'at-signs',
    label: 'at signs (@)',
    exactMatcher: /^(?:at\s+signs?|at\s+symbols?)$/i,
    keywordMatcher: /\bat\s+(?:signs?|symbols?)\b/i,
    findPattern: '@',
    singleUnitPattern: '@',
    charClassChars: '@',
    replaceLiteral: '@',
    features: ['At-sign literal (@)']
  },
  {
    id: 'punctuation',
    label: 'punctuation marks',
    exactMatcher: /^(?:all\s+)?(?:punctuation|punctuation\s+marks?|punctuation\s+characters?)$/i,
    keywordMatcher: /\bpunctuation(?:\s+marks?|\s+characters?)?\b/i,
    findPattern: '[.,!?;:\'"()\\[\\]{}\\-–—/\\\\]',
    singleUnitPattern: '[.,!?;:\'"()\\[\\]{}\\-–—/\\\\]',
    charClassChars: '.,!?;:\'"()\\[\\]{}\\-–—/\\\\',
    features: ['Punctuation character class ([.,!?;:...])']
  },
  {
    id: 'symbols',
    label: 'symbols / special characters',
    exactMatcher: /^(?:all\s+)?(?:symbols?|special\s+characters?|non-alphanumeric\s+characters?)$/i,
    keywordMatcher: /\b(?:symbols?|special\s+characters?)\b/i,
    findPattern: '[^\\w\\s]',
    singleUnitPattern: '[^\\w\\s]',
    features: ['Negated word/whitespace class ([^\\w\\s])']
  },

  // =========================================================================
  // 4. CHARACTER CLASSES, CASE & TOKENS
  // =========================================================================
  {
    id: 'uppercase-words',
    label: 'uppercase words',
    exactMatcher: /^(?:uppercase\s+words?|upper-case\s+words?|all-caps\s+words?|all\s+caps\s+words?|words?\s+in\s+all\s+caps|acronyms?)$/i,
    keywordMatcher: /\b(?:uppercase\s+words?|all[- ]caps\s+words?|acronyms?)\b/i,
    findPattern: '\\b[A-Z]+\\b',
    singleUnitPattern: '[A-Z]',
    charClassChars: 'A-Z',
    supportsWordBoundary: true,
    features: ['Word boundary (\\b)', 'Uppercase range ([A-Z]+)']
  },
  {
    id: 'lowercase-words',
    label: 'lowercase words',
    exactMatcher: /^(?:lowercase\s+words?|lower-case\s+words?|words?\s+in\s+lowercase)$/i,
    keywordMatcher: /\blowercase\s+words?\b/i,
    findPattern: '\\b[a-z]+\\b',
    singleUnitPattern: '[a-z]',
    charClassChars: 'a-z',
    supportsWordBoundary: true,
    features: ['Word boundary (\\b)', 'Lowercase range ([a-z]+)']
  },
  {
    id: 'capitalized-words',
    label: 'capitalized / Title Case words',
    exactMatcher: /^(?:capitalized\s+words?|title[- ]case\s+words?|words?\s+(?:starting|beginning)\s+with\s+a\s+capital\s+letter)$/i,
    keywordMatcher: /\b(?:capitalized\s+words?|title[- ]case\s+words?)\b/i,
    findPattern: '\\b[A-Z][a-z]+\\b',
    singleUnitPattern: '\\b[A-Z][a-z]+\\b',
    supportsWordBoundary: true,
    features: ['Word boundary (\\b)', 'Capitalized word pattern ([A-Z][a-z]+)']
  },
  {
    id: 'caps',
    label: 'uppercase / capital letters',
    exactMatcher: /^(?:caps|capitals?|capital\s+letters?|uppercase|upper\s+case|uppercase\s+letters?|upper-case\s+letters?|uppercase\s+characters?|all\s+caps)$/i,
    keywordMatcher: /\b(?:caps|capitals?|capital\s+letters?|uppercase(?:\s+letters?|\s+characters?)?|upper[- ]case(?:\s+letters?)?)\b/i,
    findPattern: '[A-Z]+',
    singleUnitPattern: '[A-Z]',
    charClassChars: 'A-Z',
    features: ['Uppercase character range ([A-Z]+)']
  },
  {
    id: 'lowercase',
    label: 'lowercase letters',
    exactMatcher: /^(?:lowercase|lower\s+case|lowercase\s+letters?|lower-case\s+letters?|lowercase\s+characters?|small\s+letters?)$/i,
    keywordMatcher: /\b(?:lowercase(?:\s+letters?|\s+characters?)?|lower[- ]case(?:\s+letters?)?|small\s+letters?)\b/i,
    findPattern: '[a-z]+',
    singleUnitPattern: '[a-z]',
    charClassChars: 'a-z',
    features: ['Lowercase character range ([a-z]+)']
  },
  {
    id: 'vowels',
    label: 'vowels',
    exactMatcher: /^(?:vowels?|vowel\s+letters?)$/i,
    keywordMatcher: /\bvowels?\b/i,
    findPattern: '[aeiouAEIOU]',
    singleUnitPattern: '[aeiouAEIOU]',
    charClassChars: 'aeiouAEIOU',
    features: ['Vowel character class ([aeiouAEIOU])']
  },
  {
    id: 'consonants',
    label: 'consonants',
    exactMatcher: /^(?:consonants?|consonant\s+letters?)$/i,
    keywordMatcher: /\bconsonants?\b/i,
    findPattern: '[b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z]',
    singleUnitPattern: '[b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z]',
    charClassChars: 'b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z',
    features: ['Consonant character class ([b-df-hj-np-tv-z...])']
  },
  {
    id: 'letters',
    label: 'letters / alphabetical characters',
    exactMatcher: /^(?:letters?|alphabetic(?:al)?(?:\s+characters?)?|alpha|alphabet\s+characters?)$/i,
    keywordMatcher: /\b(?:letters?|alphabetic(?:al)?(?:\s+characters?)?)\b/i,
    findPattern: '[a-zA-Z]+',
    singleUnitPattern: '[a-zA-Z]',
    charClassChars: 'a-zA-Z',
    features: ['Alphabetical character range ([a-zA-Z]+)']
  },
  {
    id: 'decimals',
    label: 'decimal / floating-point numbers',
    exactMatcher: /^(?:decimals?|decimal\s+numbers?|floats?|floating[- ]point\s+numbers?)$/i,
    keywordMatcher: /\b(?:decimals?|decimal\s+numbers?|floats?|floating[- ]point\s+numbers?)\b/i,
    findPattern: '\\b\\d+\\.\\d+\\b',
    singleUnitPattern: '\\d+\\.\\d+',
    supportsWordBoundary: true,
    features: ['Digit shorthand (\\d+)', 'Escaped decimal point (\\.)']
  },
  {
    id: 'zeros',
    label: 'zeros (0)',
    exactMatcher: /^(?:zeros|zeroes|0s)$/i,
    keywordMatcher: /\b(?:zeros|zeroes|0s)\b/i,
    findPattern: '0+',
    singleUnitPattern: '0',
    charClassChars: '0',
    replaceLiteral: '0',
    features: ['Zero digit match (0+)']
  },
  {
    id: 'digits',
    label: 'digits',
    exactMatcher: /^(?:digits?|numeric\s+digits?|\\d)$/i,
    keywordMatcher: /\bdigits?\b/i,
    findPattern: '\\d+',
    singleUnitPattern: '\\d',
    charClassChars: '\\d',
    supportsWordBoundary: true,
    features: ['Digit shorthand (\\d)']
  },
  {
    id: 'numbers',
    label: 'numbers',
    exactMatcher: /^(?:numbers?|integers?|numeric\s+values?|whole\s+numbers?|numerals?)$/i,
    keywordMatcher: /\b(?:numbers?|integers?|numerals?)\b/i,
    findPattern: '\\d+',
    singleUnitPattern: '\\d',
    charClassChars: '\\d',
    supportsWordBoundary: true,
    features: ['Digit shorthand (\\d+)']
  },
  {
    id: 'non-digits',
    label: 'non-digit characters',
    exactMatcher: /^(?:non-digits?|non\s+digits?|non-numeric(?:\s+characters?)?|not\s+digits?|not\s+numbers?|\\D)$/i,
    findPattern: '\\D+',
    singleUnitPattern: '\\D',
    charClassChars: '\\D',
    features: ['Negated digit shorthand (\\D+)']
  },
  {
    id: 'hex',
    label: 'hexadecimal values',
    exactMatcher: /^(?:hex|hexadecimal|hex\s+(?:numbers?|values?|digits?|strings?|codes?)|hexadecimal\s+(?:numbers?|values?|digits?))$/i,
    keywordMatcher: /\b(?:hex|hexadecimal)(?:\s+(?:numbers?|values?|digits?|codes?))?\b/i,
    findPattern: '\\b[0-9a-fA-F]+\\b',
    singleUnitPattern: '[0-9a-fA-F]',
    charClassChars: '0-9a-fA-F',
    supportsWordBoundary: true,
    features: ['Hexadecimal character range ([0-9a-fA-F])']
  },
  {
    id: 'alphanumeric',
    label: 'alphanumeric characters',
    exactMatcher: /^(?:alphanumeric(?:s|\s+characters?)?|letters?\s+(?:and|or)\s+(?:numbers?|digits?)|(?:numbers?|digits?)\s+(?:and|or)\s+letters?)$/i,
    keywordMatcher: /\balphanumeric(?:s|\s+characters?)?\b/i,
    findPattern: '[a-zA-Z0-9]+',
    singleUnitPattern: '[a-zA-Z0-9]',
    charClassChars: 'a-zA-Z0-9',
    features: ['Alphanumeric character range ([a-zA-Z0-9]+)']
  },
  {
    id: 'words',
    label: 'words',
    exactMatcher: /^(?:words?|word\s+tokens?|word\s+characters?|\\w)$/i,
    keywordMatcher: /\bwords?\b/i,
    findPattern: '\\w+',
    singleUnitPattern: '[a-zA-Z]',
    charClassChars: '\\w',
    supportsWordBoundary: true,
    features: ['Word character shorthand (\\w+)']
  },
  {
    id: 'non-words',
    label: 'non-word characters',
    exactMatcher: /^(?:non-words?|non-word\s+characters?|\\W)$/i,
    findPattern: '\\W+',
    singleUnitPattern: '\\W',
    charClassChars: '\\W',
    features: ['Negated word shorthand (\\W+)']
  },
  {
    id: 'screaming-snake-case',
    label: 'SCREAMING_SNAKE_CASE identifiers',
    exactMatcher: /^(?:screaming_snake_case|screaming\s+snake\s+case|upper_snake_case|upper\s+snake\s+case|constant\s+case)(?:\s+(?:variables?|variable\s+names?|identifiers?|names?|words?))?$/i,
    keywordMatcher: /\b(?:screaming_snake_case|screaming\s+snake\s+case|upper_snake_case)\b/i,
    findPattern: '\\b[A-Z0-9]+(?:_[A-Z0-9]+)+\\b',
    singleUnitPattern: '\\b[A-Z0-9]+(?:_[A-Z0-9]+)+\\b',
    features: ['Uppercase range ([A-Z0-9]+)', 'Underscore delimiter (_)']
  },
  {
    id: 'snake-case',
    label: 'snake_case identifiers',
    exactMatcher: /^(?:snake_case|snake\s+case)(?:\s+(?:variables?|variable\s+names?|identifiers?|names?|words?))?$/i,
    keywordMatcher: /\b(?:snake_case|snake\s+case)\b/i,
    findPattern: '\\b[a-z0-9]+(?:_[a-z0-9]+)+\\b',
    singleUnitPattern: '\\b[a-z0-9]+(?:_[a-z0-9]+)+\\b',
    features: ['Lowercase range ([a-z0-9]+)', 'Underscore delimiter (_)']
  },
  {
    id: 'camel-case',
    label: 'camelCase identifiers',
    exactMatcher: /^(?:camelcase|camel\s+case)(?:\s+(?:variables?|variable\s+names?|identifiers?|names?|words?))?$/i,
    keywordMatcher: /\b(?:camelcase|camel\s+case)\b/i,
    findPattern: '\\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+\\b',
    singleUnitPattern: '\\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+\\b',
    features: ['CamelCase word pattern (\\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+\\b)']
  },
  {
    id: 'pascal-case',
    label: 'PascalCase identifiers',
    exactMatcher: /^(?:pascalcase|pascal\s+case)(?:\s+(?:variables?|variable\s+names?|identifiers?|names?|words?))?$/i,
    keywordMatcher: /\b(?:pascalcase|pascal\s+case)\b/i,
    findPattern: '\\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\\b',
    singleUnitPattern: '\\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\\b',
    features: ['PascalCase word pattern']
  },
  {
    id: 'kebab-case',
    label: 'kebab-case identifiers',
    exactMatcher: /^(?:kebab-case|kebab\s+case|dash-case|dash\s+case)(?:\s+(?:variables?|variable\s+names?|identifiers?|names?|words?))?$/i,
    keywordMatcher: /\b(?:kebab-case|kebab\s+case|dash-case)\b/i,
    findPattern: '\\b[a-z0-9]+(?:-[a-z0-9]+)+\\b',
    singleUnitPattern: '\\b[a-z0-9]+(?:-[a-z0-9]+)+\\b',
    features: ['Kebab-case word pattern']
  },

  // =========================================================================
  // 5. STRUCTURED ENTITIES (EMAILS, URLS, DATES, YEARS, IPS, HTML, MARKDOWN)
  // =========================================================================
  {
    id: 'emails',
    label: 'email addresses',
    exactMatcher: /^(?:email\s+address(?:es)?|emails?|e-mails?)$/i,
    keywordMatcher: /\b(?:email\s+address(?:es)?|emails?|e-mails?)\b/i,
    findPattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    singleUnitPattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    features: ['Character classes ([...])', 'One-or-more quantifier (+)', 'Range quantifier ({2,})']
  },
  {
    id: 'urls',
    label: 'URLs / web links',
    exactMatcher: /^(?:urls?|url\s+links?|web\s+links?|http\s+links?|links?|web\s+address(?:es)?|websites?)$/i,
    keywordMatcher: /\b(?:urls?|url\s+links?|web\s+links?|http\s+links?|web\s+address(?:es)?)\b/i,
    findPattern: 'https?://[^\\s"\'<>]+',
    singleUnitPattern: 'https?://[^\\s"\'<>]+',
    features: ['Optional quantifier (https?)', 'Negated character class ([^\\s"\'<>]+)']
  },
  {
    id: 'ip-addresses',
    label: 'IPv4 addresses',
    exactMatcher: /^(?:ipv4(?:\s+address(?:es)?)?|ip\s+address(?:es)?|ips)$/i,
    keywordMatcher: /\b(?:ipv4(?:\s+address(?:es)?)?|ip\s+address(?:es)?)\b/i,
    findPattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',
    singleUnitPattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',
    features: ['Non-capturing group ((?:...))', 'Range quantifier ({1,3})', 'Exact quantifier ({3})']
  },
  {
    id: 'years',
    label: 'four-digit years',
    exactMatcher: /^(?:(?:four-digit|4-digit)\s+years?|years?)$/i,
    keywordMatcher: /\b(?:four-digit|4-digit)\s+years?\b/i,
    findPattern: '\\b(19\\d{2}|20\\d{2})\\b',
    singleUnitPattern: '\\b(19\\d{2}|20\\d{2})\\b',
    features: ['Word boundary (\\b)', 'Alternation (19\\d{2}|20\\d{2})']
  },
  {
    id: 'iso-dates',
    label: 'ISO dates (YYYY-MM-DD)',
    exactMatcher: /^(?:iso\s+dates?|yyyy-mm-dd(?:\s+dates?)?)$/i,
    keywordMatcher: /\b(?:iso\s+dates?|yyyy-mm-dd)\b/i,
    findPattern: '\\b\\d{4}-\\d{2}-\\d{2}\\b',
    singleUnitPattern: '\\b\\d{4}-\\d{2}-\\d{2}\\b',
    features: ['Exact quantifiers (\\d{4}-\\d{2}-\\d{2})', 'Word boundary (\\b)']
  },
  {
    id: 'dates',
    label: 'dates',
    exactMatcher: /^(?:dates?)$/i,
    findPattern: '\\b(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})\\b',
    singleUnitPattern: '\\b(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})\\b',
    features: ['Alternation ((?:...|...))', 'Range quantifiers ({1,2}, {2,4})']
  },
  {
    id: 'phone-numbers',
    label: 'phone numbers',
    exactMatcher: /^(?:phone\s+numbers?|telephone\s+numbers?)$/i,
    keywordMatcher: /\b(?:phone|telephone)\s+numbers?\b/i,
    findPattern: '\\b(?:\\+?1[-.\\s]?)?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}\\b',
    singleUnitPattern: '\\b(?:\\+?1[-.\\s]?)?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}\\b',
    features: ['Optional groups (?)', 'Exact quantifiers (\\d{3}, \\d{4})']
  },
  {
    id: 'uuids',
    label: 'UUIDs / GUIDs',
    exactMatcher: /^(?:uuids?|guids?)$/i,
    keywordMatcher: /\b(?:uuids?|guids?)\b/i,
    findPattern: '\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b',
    singleUnitPattern: '\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b',
    features: ['Hexadecimal range ([0-9a-fA-F])', 'Exact quantifiers ({8}, {4}, {12})']
  },
  {
    id: 'html-tags',
    label: 'HTML/XML tags',
    exactMatcher: /^(?:(?:html|xml)\s+tags?|tags?)$/i,
    keywordMatcher: /\b(?:html|xml)\s+tags?\b/i,
    findPattern: '<[^>]+>',
    singleUnitPattern: '<[^>]+>',
    features: ['Negated character class ([^>]+)']
  },
  {
    id: 'markdown-links',
    label: 'Markdown links',
    exactMatcher: /^(?:markdown\s+links?)$/i,
    keywordMatcher: /\bmarkdown\s+links?\b/i,
    findPattern: '\\[([^\\]]+)\\]\\(([^)]+)\\)',
    singleUnitPattern: '\\[([^\\]]+)\\]\\(([^)]+)\\)',
    features: ['Escaped delimiters (\\[, \\], \\(, \\))', 'Capture groups ($1, $2)']
  },
  {
    id: 'markdown-headers',
    label: 'Markdown headers',
    exactMatcher: /^(?:markdown\s+(?:section\s+)?(?:headers?|headings?)|section\s+(?:headers?|headings?))$/i,
    keywordMatcher: /\bmarkdown\s+(?:section\s+)?(?:headers?|headings?)\b/i,
    findPattern: '^(#+\\s*)(.+)$',
    singleUnitPattern: '^(#+\\s*)(.+)$',
    needsMultiline: true,
    features: ['Line start/end anchors (^...$)', 'Capture groups ($1, $2)']
  },
  {
    id: 'comments',
    label: 'comments',
    exactMatcher: /^(?:(?:single-line\s+|line\s+)?comments?)$/i,
    findPattern: '//.*$',
    singleUnitPattern: '//.*$',
    needsMultiline: true,
    features: ['Line end anchor ($)', 'Wildcard (.*)']
  },
  {
    id: 'characters',
    label: 'any character',
    exactMatcher: /^(?:any\s+characters?|all\s+characters?|characters?|chars?|everything|anything|all\s+text|\.|\*)$/i,
    findPattern: '.+',
    singleUnitPattern: '.',
    features: ['Wildcard (.)']
  }
];

export interface WrapperSpec {
  open: string;
  close: string;
  label: string;
  usesWholeMatch?: boolean;
}

export function resolveWrapperSpec(wrapperPhrase: string, quoted: string[]): WrapperSpec {
  const clean = wrapperPhrase.trim();

  if (/\b(?:html\s+)?(?:anchor\s+tags?|<a>(?:\s*tags?)?|<a\s+href)/i.test(clean)) {
    return {
      open: '<a href="$&">',
      close: '</a>',
      label: 'HTML <a> anchor tags',
      usesWholeMatch: true
    };
  }

  const tagMatch = clean.match(/^<([a-zA-Z][a-zA-Z0-9]*)>(?:\s*tags?)?$/i) || clean.match(/\b<([a-zA-Z][a-zA-Z0-9]*)>\s*tags?\b/i);
  if (tagMatch) {
    const tag = tagMatch[1];
    return {
      open: `<${tag}>`,
      close: `</${tag}>`,
      label: `<${tag}> tags`
    };
  }

  if (/\bsingle\s+quotes?\b|\bapostrophes?\b/i.test(clean)) {
    return { open: "'", close: "'", label: 'single quotes' };
  }
  if (/\b(?:double\s+quotes?|quotation\s+marks?|quotes?)\b/i.test(clean)) {
    return { open: '"', close: '"', label: 'double quotes' };
  }
  if (/\bbackticks?\b/i.test(clean)) {
    return { open: '`', close: '`', label: 'backticks' };
  }
  if (/\b(?:parentheses|parenthesis|parens?|round\s+brackets?)\b/i.test(clean)) {
    return { open: '(', close: ')', label: 'parentheses' };
  }
  if (/\b(?:square\s+brackets?|brackets?)\b/i.test(clean)) {
    return { open: '[', close: ']', label: 'square brackets' };
  }
  if (/\b(?:curly\s+braces?|braces?|curly\s+brackets?)\b/i.test(clean)) {
    return { open: '{', close: '}', label: 'curly braces' };
  }
  if (/\b(?:angle\s+brackets?|chevrons?)\b/i.test(clean)) {
    return { open: '<', close: '>', label: 'angle brackets' };
  }
  if (/\b(?:asterisks?|stars?|markdown\s+bold)\b/i.test(clean)) {
    const isBold = /\bbold\b|\bdouble\b/i.test(clean);
    return { open: isBold ? '**' : '*', close: isBold ? '**' : '*', label: isBold ? '**' : '*' };
  }
  if (/\bunderscores?\b/i.test(clean)) {
    return { open: '_', close: '_', label: 'underscores' };
  }

  if (quoted.length > 0) {
    const q = quoted[quoted.length - 1];
    return { open: q, close: q, label: `'${q}'` };
  }

  const stripped = clean.replace(/^(?:a|an|the)\s+/i, '');
  return { open: stripped || '"', close: stripped || '"', label: stripped || 'quotes' };
}

export const US_UK_SPELLING_MAP: Record<string, [string, string]> = {
  color: ['color', 'colour'],
  colour: ['color', 'colour'],
  flavor: ['flavor', 'flavour'],
  flavour: ['flavor', 'flavour'],
  honor: ['honor', 'honour'],
  honour: ['honor', 'honour'],
  behavior: ['behavior', 'behaviour'],
  behaviour: ['behavior', 'behaviour'],
  labor: ['labor', 'labour'],
  labour: ['labor', 'labour'],
  neighbor: ['neighbor', 'neighbour'],
  neighbour: ['neighbor', 'neighbour'],
  favor: ['favor', 'favour'],
  favour: ['favor', 'favour'],
  center: ['center', 'centre'],
  centre: ['center', 'centre'],
  meter: ['meter', 'metre'],
  metre: ['meter', 'metre'],
  theater: ['theater', 'theatre'],
  theatre: ['theater', 'theatre'],
  organize: ['organize', 'organise'],
  organise: ['organize', 'organise'],
  analyze: ['analyze', 'analyse'],
  analyse: ['analyze', 'analyse'],
  realize: ['realize', 'realise'],
  realise: ['realize', 'realise'],
  license: ['license', 'licence'],
  licence: ['license', 'licence'],
  defense: ['defense', 'defence'],
  defence: ['defense', 'defence'],
  gray: ['gray', 'grey'],
  grey: ['gray', 'grey'],
  catalog: ['catalog', 'catalogue'],
  catalogue: ['catalog', 'catalogue'],
  dialog: ['dialog', 'dialogue'],
  dialogue: ['dialog', 'dialogue']
};

export function synthesizeTwoWordVariantPattern(
  w1: string,
  w2: string,
  wholeWord = true
): { pattern: string; summary: string; features: string[] } {
  const b = wholeWord ? '\\b' : '';
  const features: string[] = [];
  if (wholeWord) features.push('Word boundary (\\b)');

  // Case 1: One word has 1 extra character inserted (e.g., color vs colour)
  const longer = w1.length >= w2.length ? w1 : w2;
  const shorter = w1.length >= w2.length ? w2 : w1;
  if (longer.length - shorter.length === 1) {
    for (let i = 0; i < longer.length; i++) {
      if (longer.slice(0, i) + longer.slice(i + 1) === shorter) {
        const prefix = escapeRegexLiteral(longer.slice(0, i));
        const optChar = escapeRegexLiteral(longer[i]);
        const suffix = escapeRegexLiteral(longer.slice(i + 1));
        features.push('Zero-or-one quantifier (?)');
        return {
          pattern: `${b}${prefix}${optChar}?${suffix}${b}`,
          summary: `Match '${shorter}' or '${longer}' using an optional '${longer[i]}' quantifier.`,
          features
        };
      }
    }
  }

  // Case 2: Same length, differing at 1 character index (e.g., gray vs grey, organize vs organise)
  if (w1.length === w2.length && w1.length > 1) {
    let diffCount = 0;
    let diffIndex = -1;
    for (let i = 0; i < w1.length; i++) {
      if (w1[i] !== w2[i]) {
        diffCount++;
        diffIndex = i;
      }
    }
    if (diffCount === 1 && diffIndex !== -1) {
      const prefix = escapeRegexLiteral(w1.slice(0, diffIndex));
      const c1 = escapeCharClassLiteral(w1[diffIndex]);
      const c2 = escapeCharClassLiteral(w2[diffIndex]);
      const suffix = escapeRegexLiteral(w1.slice(diffIndex + 1));
      features.push(`Character set ([${c1}${c2}])`);
      return {
        pattern: `${b}${prefix}[${c1}${c2}]${suffix}${b}`,
        summary: `Match '${w1}' or '${w2}' using character class [${c1}${c2}].`,
        features
      };
    }
  }

  // Case 3: General alternation
  features.push('Alternation ((?:a|b))');
  return {
    pattern: `${b}(?:${escapeRegexLiteral(w1)}|${escapeRegexLiteral(w2)})${b}`,
    summary: `Match '${w1}' or '${w2}'.`,
    features
  };
}
