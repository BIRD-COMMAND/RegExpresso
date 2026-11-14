import { LexiconEntry } from '../types';

export const STRUCTURED_ENTITIES_ENTRIES: LexiconEntry[] = [
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
    exactMatcher:
      /^(?:urls?|url\s+links?|web\s+links?|http\s+links?|links?|web\s+address(?:es)?|websites?)$/i,
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
    findPattern:
      '\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b',
    singleUnitPattern:
      '\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b',
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
    exactMatcher:
      /^(?:markdown\s+(?:section\s+)?(?:headers?|headings?)|section\s+(?:headers?|headings?))$/i,
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
    exactMatcher:
      /^(?:any\s+characters?|all\s+characters?|characters?|chars?|everything|anything|all\s+text|\.|\*)$/i,
    findPattern: '.+',
    singleUnitPattern: '.',
    features: ['Wildcard (.)']
  }
];
