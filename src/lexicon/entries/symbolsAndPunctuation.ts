import { LexiconEntry } from '../types';

export const SYMBOLS_AND_PUNCTUATION_ENTRIES: LexiconEntry[] = [
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
    exactMatcher:
      /^(?:slash(?:es)?|any\s+slash(?:es)?|forward\s+(?:or|and)\s+back(?:ward)?\s*slash(?:es)?)$/i,
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
    exactMatcher: /^(?:double[- _]quoted\s+(?:strings?|quotations?|literals?))$/i,
    keywordMatcher: /\bdouble[- _]quoted\s+(?:strings?|quotations?|literals?)\b/i,
    findPattern: '"[^"\\r\\n]*"',
    singleUnitPattern: '"[^"\\r\\n]*"',
    features: ['Double-quoted string ("[^"\\r\\n]*")']
  },
  {
    id: 'single-quoted-strings',
    label: 'single-quoted strings',
    exactMatcher: /^(?:single[- _]quoted\s+(?:strings?|quotations?|literals?))$/i,
    keywordMatcher: /\bsingle[- _]quoted\s+(?:strings?|quotations?|literals?)\b/i,
    findPattern: "'[^'\\r\\n]*'",
    singleUnitPattern: "'[^'\\r\\n]*'",
    features: ["Single-quoted string ('[^'\\r\\n]*')"]
  },
  {
    id: 'strings',
    label: 'quoted strings / quotations (including quote marks)',
    exactMatcher:
      /^(?:strings?|quotations?|quoted\s+strings?|quoted_strings?|string\s+literals?|string_literals?)$/i,
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
    exactMatcher:
      /^(?:all\s+)?(?:symbols?|special\s+characters?|non-alphanumeric\s+characters?)$/i,
    keywordMatcher: /\b(?:symbols?|special\s+characters?)\b/i,
    findPattern: '[^\\w\\s]',
    singleUnitPattern: '[^\\w\\s]',
    features: ['Negated word/whitespace class ([^\\w\\s])']
  }
];
