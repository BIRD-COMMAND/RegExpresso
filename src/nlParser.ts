import { CompiledRegexResult, ParseOutcome, RegexStep } from './types';
import { checkImpossibleRequest } from './impossibleGuard';
import { escapeRegexLiteral, resolveWrapperSpec } from './lexicon';
import {
  ParsedQuery,
  parseQueryClauses,
  unmaskQuotes
} from './clauseParser';
import {
  resolveDelimiterOrLiteral,
  resolveReplacementClause,
  resolveTargetClause
} from './targetResolver';

export { escapeRegexLiteral } from './lexicon';

function buildFlagsString(
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

function applyLookaroundsAndExclusions(
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
        pattern = `${pattern}(?=\\s*${delim})`;
        features.push(`Positive lookahead ((?=\\s*${delim}))`);
        break;
      case 'not-followed-by':
        pattern = `${pattern}(?!\\s*${delim})`;
        features.push(`Negative lookahead ((?!\\s*${delim}))`);
        break;
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

function handleFindIntent(parsed: ParsedQuery): CompiledRegexResult {
  const hasCurrencyLookbehind = parsed.conditions.some(
    (c) => c.type === 'preceded-by' && /\bdollar\s*signs?\b|\$/i.test(c.targetPhrase)
  );

  const resolved = resolveTargetClause(parsed.targetClause, parsed.quotes, {
    hasCurrencyLookbehind,
    locationHint: parsed.locationHint
  });

  const features = [...resolved.features];
  const finalPattern = applyLookaroundsAndExclusions(resolved.pattern, parsed, features);
  const flags = buildFlagsString(parsed, resolved.needsMultiline, resolved.needsCaseInsensitive);

  // Example #13: inner HTML tag extraction provides $2 replacement as well
  const includeExtractReplace = resolved.defaultReplace === '$2';

  return {
    isPossible: true,
    mode: includeExtractReplace ? 'replace' : 'find',
    summary: `Match ${resolved.label} using \`/${finalPattern}/${flags}\`.`,
    steps: [
      {
        description: `Match ${resolved.label}`,
        find: finalPattern,
        replace: includeExtractReplace ? resolved.defaultReplace : undefined,
        flags
      }
    ],
    featuresUsed: features,
    confidence: 'high',
    preferredAction: parsed.preferredAction ?? (includeExtractReplace ? 'select-matches' : undefined)
  };
}

function handleDeleteIntent(parsed: ParsedQuery): CompiledRegexResult {
  const resolved = resolveTargetClause(parsed.targetClause, parsed.quotes, {
    locationHint: parsed.locationHint,
    isDeleteLineContext: true
  });

  const features = [...resolved.features];
  let finalPattern = applyLookaroundsAndExclusions(resolved.pattern, parsed, features);
  const flags = buildFlagsString(parsed, resolved.needsMultiline, resolved.needsCaseInsensitive);

  // For duplicate words or duplicate consecutive lines, "delete the duplicate" replaces with $1
  let replaceStr = '';
  if (resolved.lexiconId === 'duplicate-words' || resolved.lexiconId === 'duplicate-lines') {
    replaceStr = '$1';
  } else if (
    resolved.isWholeLine &&
    resolved.lexiconId !== 'blank-lines' &&
    finalPattern.endsWith('$')
  ) {
    // When deleting matching lines (e.g. "delete lines starting with #"), also consume the trailing newline
    finalPattern = `${finalPattern}\\r?\\n?`;
  }

  return {
    isPossible: true,
    mode: 'replace',
    summary:
      replaceStr === '$1'
        ? `Collapse ${resolved.label} to a single occurrence ($1).`
        : `Delete all occurrences of ${resolved.label}.`,
    steps: [
      {
        description:
          replaceStr === '$1'
            ? `Match ${resolved.label} and keep only the first occurrence`
            : `Delete ${resolved.label}`,
        find: finalPattern,
        replace: replaceStr,
        flags
      }
    ],
    featuresUsed: features,
    confidence: 'high',
    preferredAction: parsed.preferredAction ?? 'replace-all'
  };
}

function handleReplaceIntent(parsed: ParsedQuery): CompiledRegexResult {
  const targetUnmasked = unmaskQuotes(parsed.targetClause, parsed.quotes).trim();
  const replaceUnmasked = unmaskQuotes(parsed.replacementClause ?? '', parsed.quotes).trim();

  // Check date format conversions (e.g., "Convert MM/DD/YYYY dates to YYYY-MM-DD")
  if (/\bmm\/dd\/yyyy\b/i.test(targetUnmasked) && /\byyyy-mm-dd\b/i.test(replaceUnmasked)) {
    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Convert MM/DD/YYYY dates to ISO YYYY-MM-DD format.',
      steps: [
        {
          description: 'Capture month ($1), day ($2), and year ($3) and reorder as $3-$1-$2',
          find: '\\b(\\d{1,2})/(\\d{1,2})/(\\d{4})\\b',
          replace: '$3-$1-$2',
          flags: 'g'
        }
      ],
      featuresUsed: ['Capture groups ($1, $2, $3)', 'Positional backreferences ($3-$1-$2)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  if (/\byyyy-mm-dd\b/i.test(targetUnmasked) && /\bmm\/dd\/yyyy\b/i.test(replaceUnmasked)) {
    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Convert ISO YYYY-MM-DD dates to MM/DD/YYYY format.',
      steps: [
        {
          description: 'Capture year ($1), month ($2), and day ($3) and reorder as $2/$3/$1',
          find: '\\b(\\d{4})-(\\d{2})-(\\d{2})\\b',
          replace: '$2/$3/$1',
          flags: 'g'
        }
      ],
      featuresUsed: ['Capture groups ($1, $2, $3)', 'Positional backreferences ($2/$3/$1)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  const resolvedTarget = resolveTargetClause(parsed.targetClause, parsed.quotes, {
    locationHint: parsed.locationHint
  });

  const resolvedReplacement = resolveReplacementClause(
    parsed.replacementClause ?? '',
    parsed.quotes,
    resolvedTarget
  );

  const features = [...resolvedTarget.features, ...resolvedReplacement.features];
  const finalPattern = applyLookaroundsAndExclusions(resolvedTarget.pattern, parsed, features);
  const flags = buildFlagsString(
    parsed,
    resolvedTarget.needsMultiline,
    resolvedTarget.needsCaseInsensitive
  );

  return {
    isPossible: true,
    mode: 'replace',
    summary: `Replace ${resolvedTarget.label} (\`${finalPattern}\`) with \`${resolvedReplacement.replace || '(empty)'}\`.`,
    steps: [
      {
        description: `Find ${finalPattern} and replace with ${resolvedReplacement.replace || '(empty)'}`,
        find: finalPattern,
        replace: resolvedReplacement.replace,
        flags
      }
    ],
    featuresUsed: features,
    confidence: 'high',
    preferredAction: parsed.preferredAction ?? 'replace-all'
  };
}

function handleWrapIntent(parsed: ParsedQuery): CompiledRegexResult {
  const wrapperPhrase = unmaskQuotes(parsed.replacementClause ?? 'quotes', parsed.quotes);
  const wrapper = resolveWrapperSpec(wrapperPhrase, parsed.quotes);
  const resolvedTarget = resolveTargetClause(parsed.targetClause, parsed.quotes, {
    locationHint: parsed.locationHint
  });

  const features = [...resolvedTarget.features];
  const flags = buildFlagsString(
    parsed,
    resolvedTarget.needsMultiline,
    resolvedTarget.needsCaseInsensitive
  );

  let findPattern = resolvedTarget.pattern;
  let replacePattern: string;

  if (wrapper.usesWholeMatch) {
    // Example #12: Wrap every URL link in an HTML anchor tag -> <a href="$&">$&</a>
    replacePattern = `${wrapper.open}$&${wrapper.close}`;
    features.push('Whole-match replacement token ($&)');
  } else if (findPattern === '^(.+)$') {
    // Example #2: Put quotation marks around every item in this column -> ^(.+)$ -> "$1"
    replacePattern = `${wrapper.open}$1${wrapper.close}`;
    features.push('Numbered replacement backreference ($1)');
  } else {
    if (!/^\([^?].*\)$/.test(findPattern)) {
      findPattern = `(${findPattern})`;
    }
    replacePattern = `${wrapper.open}$1${wrapper.close}`;
    features.push('Capture group (($1))');
  }

  return {
    isPossible: true,
    mode: 'replace',
    summary: `Wrap ${resolvedTarget.label} in ${wrapper.label}.`,
    steps: [
      {
        description: `Capture ${resolvedTarget.label} and wrap with ${wrapper.open}...${wrapper.close}`,
        find: findPattern,
        replace: replacePattern,
        flags
      }
    ],
    featuresUsed: features,
    confidence: 'high',
    preferredAction: 'replace-all'
  };
}

function handleInsertAddIntent(parsed: ParsedQuery): CompiledRegexResult {
  const ins = resolveReplacementClause(parsed.replacementClause ?? '', parsed.quotes);
  const charToInsert = ins.replace;
  const escapedChar = escapeRegexLiteral(charToInsert);

  if (parsed.insertPosition === 'end-of-line') {
    if (parsed.missingCheck) {
      // Example #5: "Add a semicolon to the end of every line that doesn't have one."
      return {
        isPossible: true,
        mode: 'replace',
        summary: `Append '${charToInsert}' to the end of every line that does not already end with '${charToInsert}', preserving trailing whitespace.`,
        steps: [
          {
            description: `Negative lookbehind (?<!${escapedChar}) before optional trailing whitespace and line end`,
            find: `(?<!${escapedChar})(\\s*)$`,
            replace: `${charToInsert}$1`,
            flags: 'gm'
          }
        ],
        featuresUsed: [
          'Line end anchor ($)',
          `Negative lookbehind ((?<!${escapedChar}))`,
          'Whitespace preservation ($1)'
        ],
        confidence: 'high',
        preferredAction: 'replace-all'
      };
    }

    return {
      isPossible: true,
      mode: 'replace',
      summary: `Append '${charToInsert}' to the end of every non-empty line.`,
      steps: [
        {
          description: `Match non-empty line and append '${charToInsert}'`,
          find: '^(.+)$',
          replace: `$1${charToInsert}`,
          flags: 'gm'
        }
      ],
      featuresUsed: ['Line start/end anchors (^...$)', 'Backreference ($1)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  if (parsed.insertPosition === 'start-of-line') {
    if (parsed.missingCheck) {
      return {
        isPossible: true,
        mode: 'replace',
        summary: `Prepend '${charToInsert}' to the start of every line that does not already start with '${charToInsert}'.`,
        steps: [
          {
            description: `Negative lookahead (?!\\s*${escapedChar}) at start of line`,
            find: `^(?!\\s*${escapedChar})(.+)$`,
            replace: `${charToInsert}$1`,
            flags: 'gm'
          }
        ],
        featuresUsed: [
          'Line start anchor (^)',
          `Negative lookahead ((?!\\s*${escapedChar}))`,
          'Backreference ($1)'
        ],
        confidence: 'high',
        preferredAction: 'replace-all'
      };
    }

    return {
      isPossible: true,
      mode: 'replace',
      summary: `Prepend '${charToInsert}' to the beginning of every non-empty line.`,
      steps: [
        {
          description: `Match start of non-empty line and prepend '${charToInsert}'`,
          find: '^(.+)$',
          replace: `${charToInsert}$1`,
          flags: 'gm'
        }
      ],
      featuresUsed: ['Line start/end anchors (^...$)', 'Backreference ($1)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  // Insert before or after a specific target pattern
  const target = resolveTargetClause(parsed.targetClause, parsed.quotes);
  const isBefore = parsed.insertPosition === 'before-target';
  const findPat = `(${target.pattern})`;
  const replacePat = isBefore ? `${charToInsert}$1` : `$1${charToInsert}`;

  return {
    isPossible: true,
    mode: 'replace',
    summary: `Insert '${charToInsert}' ${isBefore ? 'before' : 'after'} every ${target.label}.`,
    steps: [
      {
        description: `Capture ${target.label} and insert '${charToInsert}' ${isBefore ? 'before' : 'after'} $1`,
        find: findPat,
        replace: replacePat,
        flags: buildFlagsString(parsed, target.needsMultiline, target.needsCaseInsensitive)
      }
    ],
    featuresUsed: [...target.features, 'Capture group ($1)'],
    confidence: 'high',
    preferredAction: 'replace-all'
  };
}

function handleSwapIntent(parsed: ParsedQuery): CompiledRegexResult {
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

function handleCaseTransformIntent(parsed: ParsedQuery): CompiledRegexResult {
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
        featuresUsed: ['Full-word lowercase (\\L...\\E)', 'Single uppercase (\\U)', 'Multi-step pipeline'],
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
      featuresUsed: ['Line start anchor (^)', 'Prefix group retention ($1)', 'Uppercase operator (\\U$2)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  // Example #17: "Capitalize the very first letter of every line" (or concise "cap first letter per" / "cap first per")
  if (
    (mode === 'capitalize-first' || mode === 'title') &&
    (/\b(?:first\s+(?:letter|character|char|\.|\\*))\s+(?:per|per[-\s]lines?|(?:of|on|in)\s+(?:every|each|all|a|the)?\s*lines?)\b/i.test(targetRaw) ||
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
  const findPat = /^\([^?].*\)$/.test(resolved.pattern) ? resolved.pattern : `(${resolved.pattern})`;
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

function handleExtractIntent(parsed: ParsedQuery): CompiledRegexResult {
  const clause = unmaskQuotes(parsed.targetClause, parsed.quotes);

  // Example #15: "Extract the domain part of an email address into named variables"
  if (/\b(?:email|domain|user)\b/i.test(clause)) {
    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Capture email username and domain separately using named capture groups (?<user>...) and (?<domain>...).',
      steps: [
        {
          description: 'Extract username and domain with named capture groups',
          find: '(?<user>[a-zA-Z0-9._%+-]+)@(?<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
          replace: 'Domain: $<domain>, User: $<user>',
          flags: 'g'
        }
      ],
      featuresUsed: ['Named capture groups ((?<name>...))', 'Named replacement backreferences ($<name>)'],
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
      featuresUsed: ['Named capture groups ((?<year>...))', 'Named replacement backreferences ($<name>)'],
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

/**
 * Main entry point: parses any English natural language regex request.
 */
export function parseNaturalLanguageRequest(prompt: string): ParseOutcome {
  const clean = prompt.trim();

  // Stage 1: Check if the request is theoretically or practically impossible in VS Code Regex
  const impossible = checkImpossibleRequest(clean);
  if (impossible) {
    return impossible;
  }

  // Stage 2: Check if user chained two distinct commands with "and then"
  if (/\band\s+then\b/i.test(clean)) {
    const subPrompts = clean.split(/\band\s+then\b/i).map((s) => s.trim()).filter(Boolean);
    if (subPrompts.length >= 2) {
      const steps: RegexStep[] = [];
      const features: string[] = ['Multi-step pipeline'];
      for (const sp of subPrompts) {
        const subOutcome = parseNaturalLanguageRequest(sp);
        if (subOutcome.isPossible) {
          steps.push(...subOutcome.steps);
          features.push(...subOutcome.featuresUsed);
        }
      }
      if (steps.length >= 2) {
        return {
          isPossible: true,
          mode: 'multi-step',
          summary: `Execute ${steps.length}-step regex pipeline: ${subPrompts.join(' → ')}.`,
          steps,
          featuresUsed: Array.from(new Set(features)),
          confidence: 'high',
          preferredAction: 'replace-all'
        };
      }
    }
  }

  // Stage 3: Macro-Level Intent & Clause Decomposition
  const parsed = parseQueryClauses(clean);

  // Stage 4: Delegate to Specialized Intent Handler
  switch (parsed.intent) {
    case 'FIND':
      return handleFindIntent(parsed);
    case 'DELETE':
      return handleDeleteIntent(parsed);
    case 'REPLACE':
      return handleReplaceIntent(parsed);
    case 'WRAP':
      return handleWrapIntent(parsed);
    case 'INSERT_ADD':
      return handleInsertAddIntent(parsed);
    case 'SWAP_REORDER':
      return handleSwapIntent(parsed);
    case 'CASE_TRANSFORM':
      return handleCaseTransformIntent(parsed);
    case 'EXTRACT_CAPTURE':
      return handleExtractIntent(parsed);
  }
}
