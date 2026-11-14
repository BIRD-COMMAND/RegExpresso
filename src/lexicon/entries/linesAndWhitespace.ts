import { LexiconEntry } from '../types';

export const LINES_AND_WHITESPACE_ENTRIES: LexiconEntry[] = [
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
    keywordMatcher:
      /\b(?:duplicate|repeated|doubled)\s+words?\b|\bwords?\s+(?:that\s+(?:is|are)\s+)?(?:accidentally\s+)?(?:typed|written|repeated|duplicated)\s+twice(?:\s+in\s+a\s+row)?\b/i,
    findPattern: '\\b([a-zA-Z]+)\\s+\\1\\b',
    singleUnitPattern: '\\b([a-zA-Z]+)\\s+\\1\\b',
    replaceLiteral: '$1',
    features: ['Search backreference (\\1)', 'Character range ([a-zA-Z]+)', 'Word boundary (\\b)']
  },
  {
    id: 'non-empty-lines',
    label: 'non-empty lines / column items',
    exactMatcher:
      /^(?:every\s+|each\s+|all\s+)?(?:non-empty\s+)?(?:lines?|rows?|items?(?:\s+in\s+this\s+(?:column|list|file))?|entries|records)$/i,
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
    exactMatcher:
      /^(?:leading\s+(?:and|or)\s+trailing\s+(?:whitespace|spaces?|tabs?)|(?:whitespace|spaces?)\s+at\s+(?:the\s+)?(?:start|beginning)\s+and\s+end\s+of\s+(?:every\s+|each\s+|the\s+)?lines?)$/i,
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
    exactMatcher:
      /^(?:leading\s+(?:whitespace|spaces?|tabs?)|indentation|indentations|spaces?\s+at\s+(?:the\s+)?(?:start|beginning)\s+of\s+(?:every\s+|each\s+|the\s+)?lines?)$/i,
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
    exactMatcher:
      /^(?:trailing\s+(?:whitespace|spaces?|tabs?)|(?:whitespace|spaces?|tabs?)\s+at\s+(?:the\s+)?end\s+of\s+(?:every\s+|each\s+|the\s+)?lines?)$/i,
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
    exactMatcher:
      /^(?:multiple|extra|consecutive|double|two\s+or\s+more|duplicate|redundant)\s+(?:spaces|whitespace)$/i,
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
    exactMatcher:
      /^(?:newlines?|new\s+lines?|line\s*breaks?|carriage\s+returns?|crlf|lf|\\n|\\r\\n)$/i,
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
    exactMatcher:
      /^(?:horizontal\s+whitespace|spaces?\s+(?:and|or)\s+tabs?|tabs?\s+(?:and|or)\s+spaces?)$/i,
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
    exactMatcher:
      /^(?:whitespace|whitespaces|white\s+space|whitespace\s+characters?|any\s+whitespace|\\s)$/i,
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
    exactMatcher:
      /^(?:non-whitespace|non-space|non\s+whitespace|not\s+whitespace|not\s+spaces?|\\S)\s*(?:characters?|chars?|tokens?)?$/i,
    findPattern: '\\S+',
    singleUnitPattern: '\\S',
    charClassChars: '\\S',
    features: ['Negated whitespace shorthand (\\S+)']
  }
];
