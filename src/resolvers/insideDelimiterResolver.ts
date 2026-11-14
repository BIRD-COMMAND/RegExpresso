import { ResolvedTarget } from '../types';
import { resolveDelimiterOrLiteral } from './primitiveResolver';

const CONCISE_INNER_SUFFIX =
  '(?:[\\s_]+(?:text|words?|content|characters?|chars?|items?|values?|stuff|parts?|segments?))?';

export interface InnerDelimiterRule {
  conciseMatcher: RegExp;
  containerMatcher: RegExp;
  pattern: string;
  conciseLabel: string;
  containerLabel: string;
  features: string[];
  needsMultiline: boolean;
}

export const INNER_DELIMITER_RULES: InnerDelimiterRule[] = [
  {
    conciseMatcher: new RegExp(`^quoted${CONCISE_INNER_SUFFIX}$`, 'i'),
    containerMatcher:
      /^(?:quotes?|quot(?:ation|ed?)[\s_]+marks?|quotations?|strings?|quoted[\s_]+strings?)$/i,
    pattern:
      '(?<=^(?:[^"\\r\\n]*"[^"\\r\\n]*")*[^"\\r\\n]*")[^"\\r\\n]+(?=")|(?<=^(?:[^\'\\r\\n]*\'[^\'\\r\\n]*\')*[^\'\\r\\n]*\')[^\'\\r\\n]+(?=\')',
    conciseLabel: 'quoted text (excluding quotation marks)',
    containerLabel: 'text inside quotes',
    features: [
      'Positive lookbehind for opening quote',
      'Negated character class ([^"\\r\\n]+)',
      'Positive lookahead ((?=["\']))'
    ],
    needsMultiline: true
  },
  {
    conciseMatcher: new RegExp(`^double[-\\s_]quoted${CONCISE_INNER_SUFFIX}$`, 'i'),
    containerMatcher: /^(?:double[-\s_]+(?:quotes?|quot(?:ation|ed?)[\s_]+marks?|quotations?))$/i,
    pattern: '(?<=^(?:[^"\\r\\n]*"[^"\\r\\n]*")*[^"\\r\\n]*")[^"\\r\\n]+(?=")',
    conciseLabel: 'double-quoted text (excluding quotation marks)',
    containerLabel: 'text inside double quotes',
    features: [
      'Positive lookbehind for opening double quote',
      'Negated character class ([^"\\r\\n]+)',
      'Positive lookahead ((?="))'
    ],
    needsMultiline: true
  },
  {
    conciseMatcher: new RegExp(`^single[-\\s_]quoted${CONCISE_INNER_SUFFIX}$`, 'i'),
    containerMatcher:
      /^(?:single[-\s_]+(?:quotes?|quot(?:ation|ed?)[\s_]+marks?|quotations?)|apostrophes?)$/i,
    pattern: "(?<=^(?:[^'\\r\\n]*'[^'\\r\\n]*')*[^'\\r\\n]*')[^'\\r\\n]+(?=')",
    conciseLabel: 'single-quoted text (excluding quotation marks)',
    containerLabel: 'text inside single quotes',
    features: [
      'Positive lookbehind for opening single quote',
      "Negated character class ([^'\\r\\n]+)",
      "Positive lookahead ((?='))"
    ],
    needsMultiline: true
  },
  {
    conciseMatcher: new RegExp(
      `^(?:back[-\\s_]?ticked|back[-\\s_]?tick[-\\s_]quoted)${CONCISE_INNER_SUFFIX}$`,
      'i'
    ),
    containerMatcher: /^(?:back[-\s_]?ticks?|back[-\s_]?quotes?|grave[\s_]+accents?|graves?)$/i,
    pattern: '(?<=^(?:[^`\\r\\n]*`[^`\\r\\n]*`)*[^`\\r\\n]*`)[^`\\r\\n]+(?=`)',
    conciseLabel: 'backticked text (excluding backticks)',
    containerLabel: 'text inside backticks',
    features: [
      'Positive lookbehind for opening backtick',
      'Negated character class ([^`\\r\\n]+)',
      'Positive lookahead ((?=`))'
    ],
    needsMultiline: true
  },
  {
    conciseMatcher: new RegExp(`^(?:parenthesized|parenthetical)${CONCISE_INNER_SUFFIX}$`, 'i'),
    containerMatcher: /^(?:parenthes[ei]s|parens?|round(?:ed)?[\s_]+brackets?)$/i,
    pattern: '(?<=\\()[^)\\r\\n]+(?=\\))',
    conciseLabel: 'parenthesized text (excluding parentheses)',
    containerLabel: 'text inside parentheses',
    features: [
      'Positive lookbehind ((?<=\\())',
      'Negated character class ([^)\\r\\n]+)',
      'Positive lookahead ((?=\\)))'
    ],
    needsMultiline: false
  },
  {
    conciseMatcher: new RegExp(`^(?:(?:square[-\\s_])?bracketed)${CONCISE_INNER_SUFFIX}$`, 'i'),
    containerMatcher: /^(?:(?:square[\s_]+)?brackets?)$/i,
    pattern: '(?<=\\[)[^\\]\\r\\n]+(?=\\])',
    conciseLabel: 'bracketed text (excluding brackets)',
    containerLabel: 'text inside square brackets',
    features: [
      'Positive lookbehind ((?<=\\[))',
      'Negated character class ([^\\]\\r\\n]+)',
      'Positive lookahead ((?=\\]))'
    ],
    needsMultiline: false
  },
  {
    conciseMatcher: new RegExp(`^(?:(?:curly[-\\s_])?braced)${CONCISE_INNER_SUFFIX}$`, 'i'),
    containerMatcher: /^(?:(?:curly[\s_]+)?braces?|curly[\s_]+brackets?)$/i,
    pattern: '(?<=\\{)[^}\\r\\n]+(?=\\})',
    conciseLabel: 'braced text (excluding braces)',
    containerLabel: 'text inside curly braces',
    features: [
      'Positive lookbehind ((?<=\\{))',
      'Negated character class ([^}\\r\\n]+)',
      'Positive lookahead ((?=\\}))'
    ],
    needsMultiline: false
  },
  {
    conciseMatcher: new RegExp(`^angle[-\\s_]bracketed${CONCISE_INNER_SUFFIX}$`, 'i'),
    containerMatcher: /^(?:angle[\s_]+brackets?|angles?|chevrons?)$/i,
    pattern: '(?<=<)[^>\\r\\n]+(?=>)',
    conciseLabel: 'angle-bracketed text (excluding angle brackets)',
    containerLabel: 'text inside angle brackets',
    features: [
      'Positive lookbehind ((?<=<))',
      'Negated character class ([^>\\r\\n]+)',
      'Positive lookahead ((?=>))'
    ],
    needsMultiline: false
  }
];

/**
 * Resolves inner/delimited content queries (EXCLUDING the surrounding delimiters):
 * - "quoted", "quoted text", "double-quoted text", "single-quoted text", "parenthesized text", "bracketed text", "braced text"
 * - "all text inside HTML tags" (Example #13)
 * - "text inside parentheses / brackets / braces / quotes", "between quotes"
 * - "everything between X and Y"
 */
export function tryResolveInsideOrBetween(
  phrase: string,
  quotes: string[]
): ResolvedTarget | null {
  // Example #13: "text inside HTML tags" / "between opening and closing tag"
  if (
    /\b(?:text|content|chars|characters|everything|anything|what's)?\s*(?:in|inside|between|within)\s+(?:the\s+)?(?:first\s+)?(?:open(?:ing|ed)?\s+(?:and|&)\s+clos(?:e|ed|ing)\s+)?(?:html|xml)?\s*tags?\b/i.test(
      phrase
    )
  ) {
    return {
      pattern: '<([a-z]+)>(.*?)</\\1>',
      label: 'text inside matching HTML tags',
      features: [
        'Lazy/non-greedy quantifier (*?)',
        'Backreference to tag name (\\1)',
        'Capture group ($2)'
      ],
      needsMultiline: false,
      needsCaseInsensitive: true,
      defaultReplace: '$2',
      hasCaptureGroups: true
    };
  }

  // 1. Check concise "<delimiter>-ed [text/words/...]" forms
  for (const rule of INNER_DELIMITER_RULES) {
    if (rule.conciseMatcher.test(phrase)) {
      return {
        pattern: rule.pattern,
        label: rule.conciseLabel,
        features: rule.features,
        needsMultiline: rule.needsMultiline,
        needsCaseInsensitive: false
      };
    }
  }

  // 2. Check "text inside <container>" / "between <container>"
  const insideContainerMatch = phrase.match(
    /^(?:(?:(?:all|the)\s+)*(?:text|content|characters?|chars?|words?|stuff|everything|anything|values?|items?)\s+(?:(?:that'?s|that\s+(?:is|are)|which\s+(?:is|are))\s+)?(?:inside|within|between|in|enclosed[\s_]+(?:in|by|with)|wrapped[\s_]+(?:in|by|with)|surrounded[\s_]+(?:in|by|with))|(?:inside|within|between|in|enclosed[\s_]+(?:in|by|with)|wrapped[\s_]+(?:in|by|with)|surrounded[\s_]+(?:in|by|with)))\s+(?:of\s+)?(?:(?:the|all|each|every|any|matching|paired)\s+)*(.+)$/i
  );
  if (insideContainerMatch) {
    const container = insideContainerMatch[1].trim();
    for (const rule of INNER_DELIMITER_RULES) {
      if (rule.containerMatcher.test(container)) {
        return {
          pattern: rule.pattern,
          label: rule.containerLabel,
          features: rule.features,
          needsMultiline: rule.needsMultiline,
          needsCaseInsensitive: false
        };
      }
    }

    // "between <A> and <B>"
    const betweenPair = container.match(/^(.+?)\s+and\s+(.+)$/i);
    if (betweenPair) {
      const left = resolveDelimiterOrLiteral(betweenPair[1], quotes);
      const right = resolveDelimiterOrLiteral(betweenPair[2], quotes);
      return {
        pattern: `(?<=${left})[^\\r\\n]+?(?=${right})`,
        label: `text between ${left} and ${right}`,
        features: [
          `Positive lookbehind ((?<=${left}))`,
          'Lazy quantifier ([^\\r\\n]+?)',
          `Positive lookahead ((?=${right}))`
        ],
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
  }

  return null;
}
