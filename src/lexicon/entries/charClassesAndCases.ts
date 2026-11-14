import { LexiconEntry } from '../types';

export const CHAR_CLASSES_AND_CASES_ENTRIES: LexiconEntry[] = [
  {
    id: 'uppercase-words',
    label: 'uppercase words',
    exactMatcher:
      /^(?:uppercase\s+words?|upper-case\s+words?|all-caps\s+words?|all\s+caps\s+words?|words?\s+in\s+all\s+caps|acronyms?)$/i,
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
    exactMatcher:
      /^(?:capitalized\s+words?|title[- ]case\s+words?|words?\s+(?:starting|beginning)\s+with\s+a\s+capital\s+letter)$/i,
    keywordMatcher: /\b(?:capitalized\s+words?|title[- ]case\s+words?)\b/i,
    findPattern: '\\b[A-Z][a-z]+\\b',
    singleUnitPattern: '\\b[A-Z][a-z]+\\b',
    supportsWordBoundary: true,
    features: ['Word boundary (\\b)', 'Capitalized word pattern ([A-Z][a-z]+)']
  },
  {
    id: 'caps',
    label: 'uppercase / capital letters',
    exactMatcher:
      /^(?:caps|capitals?|capital\s+letters?|uppercase|upper\s+case|uppercase\s+letters?|upper-case\s+letters?|uppercase\s+characters?|all\s+caps)$/i,
    keywordMatcher:
      /\b(?:caps|capitals?|capital\s+letters?|uppercase(?:\s+letters?|\s+characters?)?|upper[- ]case(?:\s+letters?)?)\b/i,
    findPattern: '[A-Z]+',
    singleUnitPattern: '[A-Z]',
    charClassChars: 'A-Z',
    features: ['Uppercase character range ([A-Z]+)']
  },
  {
    id: 'lowercase',
    label: 'lowercase letters',
    exactMatcher:
      /^(?:lowercase|lower\s+case|lowercase\s+letters?|lower-case\s+letters?|lowercase\s+characters?|small\s+letters?)$/i,
    keywordMatcher:
      /\b(?:lowercase(?:\s+letters?|\s+characters?)?|lower[- ]case(?:\s+letters?)?|small\s+letters?)\b/i,
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
    exactMatcher:
      /^(?:letters?|alphabetic(?:al)?(?:\s+characters?)?|alpha|alphabet\s+characters?)$/i,
    keywordMatcher: /\b(?:letters?|alphabetic(?:al)?(?:\s+characters?)?)\b/i,
    findPattern: '[a-zA-Z]+',
    singleUnitPattern: '[a-zA-Z]',
    charClassChars: 'a-zA-Z',
    features: ['Alphabetical character range ([a-zA-Z]+)']
  },
  {
    id: 'decimals',
    label: 'decimal / floating-point numbers',
    exactMatcher:
      /^(?:decimals?|decimal\s+numbers?|floats?|floating[- ]point\s+numbers?)$/i,
    keywordMatcher:
      /\b(?:decimals?|decimal\s+numbers?|floats?|floating[- ]point\s+numbers?)\b/i,
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
    exactMatcher:
      /^(?:non-digits?|non\s+digits?|non-numeric(?:\s+characters?)?|not\s+digits?|not\s+numbers?|\\D)$/i,
    findPattern: '\\D+',
    singleUnitPattern: '\\D',
    charClassChars: '\\D',
    features: ['Negated digit shorthand (\\D+)']
  },
  {
    id: 'hex',
    label: 'hexadecimal values',
    exactMatcher:
      /^(?:hex|hexadecimal|hex\s+(?:numbers?|values?|digits?|strings?|codes?)|hexadecimal\s+(?:numbers?|values?|digits?))$/i,
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
    exactMatcher:
      /^(?:alphanumeric(?:s|\s+characters?)?|letters?\s+(?:and|or)\s+(?:numbers?|digits?)|(?:numbers?|digits?)\s+(?:and|or)\s+letters?)$/i,
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
    exactMatcher:
      /^(?:screaming_snake_case|screaming\s+snake\s+case|upper_snake_case|upper\s+snake\s+case|constant\s+case)(?:\s+(?:variables?|variable\s+names?|identifiers?|names?|words?))?$/i,
    keywordMatcher: /\b(?:screaming_snake_case|screaming\s+snake\s+case|upper_snake_case)\b/i,
    findPattern: '\\b[A-Z0-9]+(?:_[A-Z0-9]+)+\\b',
    singleUnitPattern: '\\b[A-Z0-9]+(?:_[A-Z0-9]+)+\\b',
    features: ['Uppercase range ([A-Z0-9]+)', 'Underscore delimiter (_)']
  },
  {
    id: 'snake-case',
    label: 'snake_case identifiers',
    exactMatcher:
      /^(?:snake_case|snake\s+case)(?:\s+(?:variables?|variable\s+names?|identifiers?|names?|words?))?$/i,
    keywordMatcher: /\b(?:snake_case|snake\s+case)\b/i,
    findPattern: '\\b[a-z0-9]+(?:_[a-z0-9]+)+\\b',
    singleUnitPattern: '\\b[a-z0-9]+(?:_[a-z0-9]+)+\\b',
    features: ['Lowercase range ([a-z0-9]+)', 'Underscore delimiter (_)']
  },
  {
    id: 'camel-case',
    label: 'camelCase identifiers',
    exactMatcher:
      /^(?:camelcase|camel\s+case)(?:\s+(?:variables?|variable\s+names?|identifiers?|names?|words?))?$/i,
    keywordMatcher: /\b(?:camelcase|camel\s+case)\b/i,
    findPattern: '\\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+\\b',
    singleUnitPattern: '\\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+\\b',
    features: ['CamelCase word pattern (\\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+\\b)']
  },
  {
    id: 'pascal-case',
    label: 'PascalCase identifiers',
    exactMatcher:
      /^(?:pascalcase|pascal\s+case)(?:\s+(?:variables?|variable\s+names?|identifiers?|names?|words?))?$/i,
    keywordMatcher: /\b(?:pascalcase|pascal\s+case)\b/i,
    findPattern: '\\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\\b',
    singleUnitPattern: '\\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\\b',
    features: ['PascalCase word pattern']
  },
  {
    id: 'kebab-case',
    label: 'kebab-case identifiers',
    exactMatcher:
      /^(?:kebab-case|kebab\s+case|dash-case|dash\s+case)(?:\s+(?:variables?|variable\s+names?|identifiers?|names?|words?))?$/i,
    keywordMatcher: /\b(?:kebab-case|kebab\s+case|dash-case)\b/i,
    findPattern: '\\b[a-z0-9]+(?:-[a-z0-9]+)+\\b',
    singleUnitPattern: '\\b[a-z0-9]+(?:-[a-z0-9]+)+\\b',
    features: ['Kebab-case word pattern']
  }
];
