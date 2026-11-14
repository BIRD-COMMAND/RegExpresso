import { CompiledRegexResult, ParsedQuery } from '../../types';
import { unmaskQuotes } from '../../grammar/tokens';
import { resolveTargetClause } from '../../resolvers';
import { buildFlagsString } from '../lookaroundApplier';

export function handleSwapIntent(parsed: ParsedQuery): CompiledRegexResult {
  const clause = unmaskQuotes(parsed.targetClause, parsed.quotes);

  let delimFind = ',\\s*';
  let delimReplace = ', ';
  let delimLabel = 'comma';

  if (/\bcolon\b|:/i.test(clause)) {
    delimFind = '\\s*:\\s*';
    delimReplace = ': ';
    delimLabel = 'colon';
  } else if (/\bsemicolon\b|;/i.test(clause)) {
    delimFind = '\\s*;\\s*';
    delimReplace = '; ';
    delimLabel = 'semicolon';
  } else if (/\bequals?\b|=/i.test(clause)) {
    delimFind = '\\s*=\\s*';
    delimReplace = ' = ';
    delimLabel = 'equals sign';
  } else if (/\bslash\b|\//i.test(clause)) {
    delimFind = '\\/';
    delimReplace = '/';
    delimLabel = 'slash';
  } else if (/\bhyphen|dash\b|-/i.test(clause) && !/\bcomma-separated\b/i.test(clause)) {
    delimFind = '-';
    delimReplace = '-';
    delimLabel = 'hyphen';
  } else if (/\bspace\b/i.test(clause)) {
    delimFind = '\\s+';
    delimReplace = ' ';
    delimLabel = 'space';
  }

  return {
    isPossible: true,
    mode: 'replace',
    summary: `Swap two ${delimLabel}-separated items on each line.`,
    steps: [
      {
        description: `Capture first and second tokens around ${delimLabel} and reverse via $2${delimReplace}$1`,
        find: `^(\\w+)${delimFind}(\\w+)$`,
        replace: `$2${delimReplace}$1`,
        flags: 'gm'
      }
    ],
    featuresUsed: [
      'Word character shorthand (\\w+)',
      'Multiple capture groups ($1, $2)',
      'Line start/end anchors (^...$)'
    ],
    confidence: 'high',
    preferredAction: 'replace-all'
  };
}

export function handleCaseTransformIntent(parsed: ParsedQuery): CompiledRegexResult {
  const targetRaw = unmaskQuotes(parsed.targetClause, parsed.quotes).trim();
  const mode = parsed.caseTargetMode ?? 'upper';

  // Example #16: SCREAMING_SNAKE_CASE (or snake_case) -> camelCase
  if (mode === 'camelCase') {
    if (/\b(?:screaming_snake_case|screaming\s+snake|upper_snake|uppercase)\b/i.test(targetRaw)) {
      return {
        isPossible: true,
        mode: 'multi-step',
        summary: 'Convert SCREAMING_SNAKE_CASE variable names into camelCase.',
        steps: [
          {
            description: 'Step 1: Lowercase leading word and capitalize second word',
            find: '([A-Z]+)_([A-Z])([A-Z]*)',
            replace: '\\L$1\\U$2\\E\\L$3',
            flags: 'g'
          },
          {
            description: 'Step 2: Convert any remaining _WORD segments on multi-underscore identifiers',
            find: '_([A-Z])([A-Z]*)',
            replace: '\\U$1\\E\\L$2',
            flags: 'g'
          }
        ],
        featuresUsed: [
          'Full-word lowercase (\\L...\\E)',
          'Single uppercase (\\U)',
          'Multi-step pipeline'
        ],
        confidence: 'high',
        preferredAction: 'replace-all'
      };
    }

    if (/\b(?:kebab-case|kebab\s+case|dash-case)\b/i.test(targetRaw)) {
      return {
        isPossible: true,
        mode: 'replace',
        summary: 'Convert kebab-case identifiers into camelCase.',
        steps: [
          {
            description: 'Match hyphen followed by lowercase letter and uppercase it',
            find: '-([a-z0-9])',
            replace: '\\U$1',
            flags: 'g'
          }
        ],
        featuresUsed: ['Capture group ($1)', 'Uppercase operator (\\U$1)'],
        confidence: 'high',
        preferredAction: 'replace-all'
      };
    }

    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Convert snake_case identifiers into camelCase.',
      steps: [
        {
          description: 'Match underscore followed by letter and uppercase it',
          find: '_([a-zA-Z0-9])',
          replace: '\\U$1',
          flags: 'g'
        }
      ],
      featuresUsed: ['Capture group ($1)', 'Uppercase operator (\\U$1)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  if (mode === 'snake_case') {
    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Convert camelCase or PascalCase identifiers into snake_case.',
      steps: [
        {
          description: 'Insert underscore before uppercase boundaries and lowercase',
          find: '([a-z0-9])([A-Z])',
          replace: '$1_\\L$2',
          flags: 'g'
        }
      ],
      featuresUsed: ['Capture groups ($1, $2)', 'Lowercase operator (\\L$2)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  if (mode === 'SCREAMING_SNAKE_CASE') {
    return {
      isPossible: true,
      mode: 'multi-step',
      summary: 'Convert identifiers into SCREAMING_SNAKE_CASE.',
      steps: [
        {
          description: 'Step 1: Insert underscore at camelCase word boundaries',
          find: '([a-z0-9])([A-Z])',
          replace: '$1_$2',
          flags: 'g'
        },
        {
          description: 'Step 2: Uppercase entire identifier',
          find: '\\b([a-zA-Z0-9_]+)\\b',
          replace: '\\U$1',
          flags: 'g'
        }
      ],
      featuresUsed: ['Capture groups ($1, $2)', 'Uppercase block operator (\\U$1)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  if (mode === 'kebab-case') {
    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Convert camelCase or snake_case identifiers into kebab-case.',
      steps: [
        {
          description: 'Replace camelCase boundary or underscore with hyphen and lowercase',
          find: '([a-z0-9])(?:_|([A-Z]))',
          replace: '$1-\\L$2',
          flags: 'g'
        }
      ],
      featuresUsed: ['Capture groups ($1, $2)', 'Lowercase operator (\\L$2)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  // Example #18: "Make all markdown section headers (# header) Title Case"
  if (/\b(?:markdown)\b.*\b(?:headers?|headings?|#)\b/i.test(targetRaw)) {
    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Match the first letter of each Markdown heading and capitalize it.',
      steps: [
        {
          description: 'Capture Markdown hashes in $1 and uppercase initial letter in $2',
          find: '^(#+\\s*)([a-z])',
          replace: '$1\\U$2',
          flags: 'gm'
        }
      ],
      featuresUsed: [
        'Line start anchor (^)',
        'Prefix group retention ($1)',
        'Uppercase operator (\\U$2)'
      ],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  // Example #17: "Capitalize the very first letter of every line" (or concise "cap first letter per" / "cap first per")
  if (
    (mode === 'capitalize-first' || mode === 'title') &&
    (/\b(?:first\s+(?:letter|character|char|\.|\\*))\s+(?:per|per[-\s]lines?|(?:of|on|in)\s+(?:every|each|all|a|the)?\s*lines?)\b/i.test(
      targetRaw
    ) ||
      /^(?:the\s+)?(?:very\s+)?first\s+(?:per|per[-\s]lines?)$/i.test(targetRaw))
  ) {
    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Convert the very first character of every line to uppercase.',
      steps: [
        {
          description: 'Capture first character on line and apply \\U$1',
          find: '^(.)',
          replace: '\\U$1',
          flags: 'gm'
        }
      ],
      featuresUsed: ['Start-of-line anchor (^)', 'Uppercase operator (\\U$1)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  if (mode === 'title' || mode === 'capitalize-first') {
    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Capitalize the first letter of every word.',
      steps: [
        {
          description: 'Capture initial letter and remaining word letters, applying \\U$1\\L$2',
          find: '\\b([a-zA-Z])([a-zA-Z]*)\\b',
          replace: '\\U$1\\L$2',
          flags: 'g'
        }
      ],
      featuresUsed: ['Word boundary (\\b)', 'Case conversion operators (\\U$1\\L$2)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  // General Uppercase or Lowercase on any target (e.g., "make caps lowercase", "make words uppercase")
  const resolved = resolveTargetClause(parsed.targetClause, parsed.quotes);
  const findPat = /^\([^?].*\)$/.test(resolved.pattern)
    ? resolved.pattern
    : `(${resolved.pattern})`;
  const op = mode === 'upper' ? '\\U$1' : '\\L$1';

  return {
    isPossible: true,
    mode: 'replace',
    summary: `Convert ${resolved.label} to ${mode === 'upper' ? 'uppercase' : 'lowercase'}.`,
    steps: [
      {
        description: `Match ${resolved.label} and apply ${op}`,
        find: findPat,
        replace: op,
        flags: buildFlagsString(parsed, resolved.needsMultiline, resolved.needsCaseInsensitive)
      }
    ],
    featuresUsed: [...resolved.features, `Case modifier (${op})`],
    confidence: 'high',
    preferredAction: 'replace-all'
  };
}

export function handleExtractIntent(parsed: ParsedQuery): CompiledRegexResult {
  const clause = unmaskQuotes(parsed.targetClause, parsed.quotes);

  // Example #15: "Extract the domain part of an email address into named variables"
  if (/\b(?:email|domain|user)\b/i.test(clause)) {
    return {
      isPossible: true,
      mode: 'replace',
      summary:
        'Capture email username and domain separately using named capture groups (?<user>...) and (?<domain>...).',
      steps: [
        {
          description: 'Extract username and domain with named capture groups',
          find: '(?<user>[a-zA-Z0-9._%+-]+)@(?<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
          replace: 'Domain: $<domain>, User: $<user>',
          flags: 'g'
        }
      ],
      featuresUsed: [
        'Named capture groups ((?<name>...))',
        'Named replacement backreferences ($<name>)'
      ],
      confidence: 'high'
    };
  }

  if (/\b(?:date|year|month|day)\b/i.test(clause)) {
    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Capture year, month, and day into named capture groups.',
      steps: [
        {
          description: 'Extract ISO date components with named groups',
          find: '\\b(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})\\b',
          replace: 'Year: $<year>, Month: $<month>, Day: $<day>',
          flags: 'g'
        }
      ],
      featuresUsed: [
        'Named capture groups ((?<year>...))',
        'Named replacement backreferences ($<name>)'
      ],
      confidence: 'high'
    };
  }

  const resolved = resolveTargetClause(parsed.targetClause, parsed.quotes);
  return {
    isPossible: true,
    mode: 'replace',
    summary: `Capture ${resolved.label} into named group (?<match>...).`,
    steps: [
      {
        description: `Named capture group for ${resolved.label}`,
        find: `(?<match>${resolved.pattern})`,
        replace: '$<match>',
        flags: buildFlagsString(parsed, resolved.needsMultiline, resolved.needsCaseInsensitive)
      }
    ],
    featuresUsed: [...resolved.features, 'Named capture group ((?<match>...))'],
    confidence: 'high'
  };
}
