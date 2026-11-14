import { CaseTransformMode, LocationHint } from '../types';
import { unmaskQuotes } from '../grammar/tokens';

export function parseCaseTransformMode(phrase: string, quotes: string[]): CaseTransformMode | null {
  const raw = unmaskQuotes(phrase, quotes).trim();
  if (/^(?:camelcase|camel\s+case|camel_case)$/i.test(raw)) return 'camelCase';
  if (/^(?:pascalcase|pascal\s+case|pascal_case)$/i.test(raw)) return 'PascalCase';
  if (
    /^(?:screaming_snake_case|screaming\s+snake\s+case|upper_snake_case|upper\s+snake\s+case|constant\s+case|cap\s+snake\s+case|cap_snake_case)$/i.test(
      raw
    )
  ) {
    return 'SCREAMING_SNAKE_CASE';
  }
  if (/^(?:snake_case|snake\s+case)$/i.test(raw)) return 'snake_case';
  if (/^(?:kebab-case|kebab\s+case|kebab_case|dash-case|dash\s+case|dash_case)$/i.test(raw)) {
    return 'kebab-case';
  }
  if (/^(?:title\s*case|title_case|capitalized)$/i.test(raw)) return 'title';
  if (/^(?:uppercase|upper\s+case|upper_case|all\s+caps|caps|capitals?)$/i.test(raw)) {
    return 'upper';
  }
  if (/^(?:lowercase|lower\s+case|lower_case|small\s+letters?)$/i.test(raw)) return 'lower';
  return null;
}

function restoreProtectedTokens(str: string): string {
  return str
    .replace(/__RANGE_TO__/g, ' to ')
    .replace(/__MOD_WITH__/g, ' with ')
    .trim();
}

/**
 * Splits a replace body "<target> with/to/into/by <replacement>" while respecting
 * modifier prepositions like "starting with X", "ending with X", and numeric ranges "3 to 5".
 */
export function splitTargetAndReplacement(
  body: string
): { target: string; replacement: string } | null {
  const numWord = '(?:\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
  let protectedBody = body.replace(
    new RegExp(`\\b(${numWord})\\s+to\\s+(${numWord})\\b`, 'gi'),
    '$1__RANGE_TO__$2'
  );
  protectedBody = protectedBody.replace(/\b(from\s+\S+)\s+to\s+(\S+)\b/gi, '$1__RANGE_TO__$2');

  protectedBody = protectedBody.replace(
    /\b(starting|beginning|ending|prefixed|suffixed)\s+with\s+(\S+)/gi,
    '$1__MOD_WITH__$2'
  );

  // Check arrow syntax first: X -> Y or X => Y
  const arrowMatch = protectedBody.match(/^(.+?)\s*(?:->|=>)\s*(.+)$/);
  if (arrowMatch) {
    return {
      target: restoreProtectedTokens(arrowMatch[1]),
      replacement: restoreProtectedTokens(arrowMatch[2])
    };
  }

  // Prefer splitting on "with" or "into" first, then "to" or "by"
  const separators = [/\s+(?:with|into)\s+/gi, /\s+(?:to|by)\s+/gi];

  for (const sepRegex of separators) {
    const matches = Array.from(protectedBody.matchAll(sepRegex));
    if (matches.length > 0) {
      const chosen = matches[matches.length - 1];
      if (chosen.index !== undefined) {
        const left = protectedBody.slice(0, chosen.index).trim();
        const right = protectedBody.slice(chosen.index + chosen[0].length).trim();
        if (left && right) {
          return {
            target: restoreProtectedTokens(left),
            replacement: restoreProtectedTokens(right)
          };
        }
      }
    }
  }

  return null;
}

export interface NormalizedQueryState {
  working: string;
  flags: {
    caseInsensitive: boolean;
    multiline: boolean;
  };
  locationHint?: LocationHint;
  nonGreedyHint: boolean;
  exclusionClause?: string;
}

/**
 * Strips conversational filler, inline examples, parenthetical notes, and extracts
 * global flags, location hints, and exclusion clauses from a masked query string.
 */
export function normalizeAndExtractGlobalHints(
  initialMasked: string,
  quotes: string[]
): NormalizedQueryState {
  let working = initialMasked.trim();
  const flags = {
    caseInsensitive: false,
    multiline: false
  };
  let locationHint: LocationHint | undefined;
  let nonGreedyHint = false;
  let exclusionClause: string | undefined;

  // 1. Strip polite conversational prefixes
  working = working
    .replace(
      /^(?:please\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+|i\s+want\s+to\s+|i\s+need\s+to\s+)/i,
      ''
    )
    .trim();

  // 2. Strip trailing sentence period only if multi-word sentence and not a literal '.' target
  if (
    working.split(/\s+/).length >= 3 &&
    /[a-zA-Z0-9)_"']\.$/.test(working) &&
    !/\b(?:with|to|into|find|select|sel|get|delete|del|rm|rep|match)\s+\.$/.test(working)
  ) {
    working = working.slice(0, -1).trim();
  }

  // 3. Detect case-insensitivity flags
  if (
    /\b(?:case[- ]insensitive(?:ly)?|ignore\s+case|regardless\s+of\s+case|any\s+case)\b/i.test(
      working
    )
  ) {
    flags.caseInsensitive = true;
    working = working
      .replace(
        /,?\s*\b(?:case[- ]insensitive(?:ly)?|ignore\s+case|regardless\s+of\s+case|in\s+any\s+case)\b/gi,
        ''
      )
      .trim();
  }

  // 4. Strip parenthetical lookaround reminders like "(don't include the dollar sign in the selection)"
  working = working
    .replace(
      /\s*\((?:don't|do\s+not|without)\s+(?:include|including|select|selecting|consume|consuming|grab|grabbing)[^)]*\)/gi,
      ''
    )
    .trim();

  // 5. Detect non-greedy / single-line span constraints (e.g., Example #13)
  if (
    /\b(?:but\s+only\s+grab\s+what's\s+between\s+the\s+first|without\s+grabbing\s+across|non-greedily|non\s+greedy|lazily|lazy)\b/i.test(
      working
    )
  ) {
    nonGreedyHint = true;
    working = working
      .replace(/,?\s*but\s+only\s+grab\s+what's\s+between\s+the\s+first\b.*$/i, '')
      .replace(/,?\s*\b(?:non-greedily|lazily)\b/gi, '')
      .trim();
  }

  // 6. Strip inline illustrative examples ", like <title>Home</title>," when preceded by a noun
  working = working
    .replace(/,\s*(?:like|such\s+as|for\s+example|e\.g\.)\s+__[QR]\d+__\s*,?/gi, ' ')
    .replace(/\s+\((?:like|such\s+as|e\.g\.)\s+[^)]+\)/gi, '')
    .trim();

  // 7. Extract trailing "but don't touch words like ..." (signals whole-word boundary)
  if (/,?\s*but\s+(?:don't|do\s+not)\s+(?:touch|match|change|affect)\s+words?\s+like\b/i.test(working)) {
    locationHint = 'whole-word';
    working = working
      .replace(
        /,?\s*but\s+(?:don't|do\s+not)\s+(?:touch|match|change|affect)\s+words?\s+like\b.*$/i,
        ''
      )
      .trim();
  }

  // 8. Extract middle-of-word location constraint (Example #20)
  if (
    /,?\s*(?:but\s+)?(?:only\s+)?(?:when|if|where)\s+(?:they|it)\s+(?:appear|appears|is|are|occur|occurs)\s+(?:in\s+the\s+middle\s+of\s+a\s+word|inside\s+a\s+word)/i.test(
      working
    ) ||
    /\bin\s+the\s+middle\s+of\s+a\s+word\b|\binside\s+a\s+word\b/i.test(working)
  ) {
    locationHint = 'middle-of-word';
    working = working
      .replace(
        /,?\s*(?:but\s+)?(?:only\s+)?(?:when|if|where)\s+(?:they|it)\s+(?:appear|appears|is|are|occur|occurs)\s+(?:in\s+the\s+middle\s+of\s+a\s+word|inside\s+a\s+word).*$/i,
        ''
      )
      .replace(/\s+(?:in\s+the\s+middle\s+of\s+a\s+word|inside\s+a\s+word)\b/i, '')
      .trim();
  }

  // 9. Extract exclusion clauses (", but ignore ...", ", except ...")
  const exclusionMatch = working.match(
    /,?\s*(?:but\s+(?:ignore|exclude|skip|not)|ignoring|excluding|except\s+for|except)\s+(.+)$/i
  );
  if (exclusionMatch) {
    exclusionClause = unmaskQuotes(exclusionMatch[1].trim(), quotes);
    working = working.slice(0, exclusionMatch.index).trim();
  }

  return {
    working,
    flags,
    locationHint,
    nonGreedyHint,
    exclusionClause
  };
}
