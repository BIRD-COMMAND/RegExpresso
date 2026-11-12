import { ExecutionAction } from './types';

export type MacroIntentType =
  | 'FIND'
  | 'DELETE'
  | 'REPLACE'
  | 'WRAP'
  | 'INSERT_ADD'
  | 'SWAP_REORDER'
  | 'CASE_TRANSFORM'
  | 'EXTRACT_CAPTURE';

export type CaseTransformMode =
  | 'upper'
  | 'lower'
  | 'title'
  | 'capitalize-first'
  | 'camelCase'
  | 'PascalCase'
  | 'snake_case'
  | 'SCREAMING_SNAKE_CASE'
  | 'kebab-case';

export interface LookaroundCondition {
  type: 'preceded-by' | 'not-preceded-by' | 'followed-by' | 'not-followed-by';
  targetPhrase: string;
}

export interface ParsedQuery {
  raw: string;
  intent: MacroIntentType;
  targetClause: string;
  replacementClause?: string;
  insertPosition?: 'start-of-line' | 'end-of-line' | 'before-target' | 'after-target';
  missingCheck?: boolean;
  caseTargetMode?: CaseTransformMode;
  conditions: LookaroundCondition[];
  exclusionClause?: string;
  locationHint?: 'start-of-line' | 'end-of-line' | 'middle-of-word' | 'whole-word' | 'whole-line';
  nonGreedyHint?: boolean;
  flags: {
    caseInsensitive: boolean;
    multiline: boolean;
  };
  preferredAction?: ExecutionAction;
  quotes: string[];
}

/**
 * Masks quoted strings (`...`, "...", '...') with __Q0__, __Q1__, etc.
 * Avoids matching apostrophes inside contractions (don't, isn't, it's) or possessives.
 */
export function maskQuotedLiterals(input: string): { masked: string; quotes: string[] } {
  const quotes: string[] = [];
  const quoteRegex = /`([^`\r\n]+)`|"([^"\r\n]+)"|(?<![a-zA-Z0-9])'([^'\r\n]+)'(?![a-zA-Z0-9])/g;

  const masked = input.replace(quoteRegex, (_full, bq, dq, sq) => {
    const val = bq ?? dq ?? sq;
    const idx = quotes.length;
    quotes.push(val);
    return `__Q${idx}__`;
  });

  return { masked, quotes };
}

export function unmaskQuotes(text: string, quotes: string[]): string {
  return text.replace(/__Q(\d+)__/g, (_m, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return quotes[idx] ?? _m;
  });
}

export function parseCaseTransformMode(phrase: string, quotes: string[]): CaseTransformMode | null {
  const raw = unmaskQuotes(phrase, quotes).trim();
  if (/^(?:camelcase|camel\s+case)$/i.test(raw)) return 'camelCase';
  if (/^(?:pascalcase|pascal\s+case)$/i.test(raw)) return 'PascalCase';
  if (/^(?:screaming_snake_case|screaming\s+snake\s+case|upper_snake_case|upper\s+snake\s+case|constant\s+case)$/i.test(raw)) {
    return 'SCREAMING_SNAKE_CASE';
  }
  if (/^(?:snake_case|snake\s+case)$/i.test(raw)) return 'snake_case';
  if (/^(?:kebab-case|kebab\s+case|dash-case|dash\s+case)$/i.test(raw)) return 'kebab-case';
  if (/^(?:title\s*case|capitalized)$/i.test(raw)) return 'title';
  if (/^(?:uppercase|upper\s+case|all\s+caps|caps|capitals?)$/i.test(raw)) return 'upper';
  if (/^(?:lowercase|lower\s+case|small\s+letters?)$/i.test(raw)) return 'lower';
  return null;
}

/**
 * Splits a replace body "<target> with/to/into/by <replacement>" while respecting
 * modifier prepositions like "starting with X", "ending with X", and numeric ranges "3 to 5".
 */
function splitTargetAndReplacement(body: string): { target: string; replacement: string } | null {
  // Protect numeric/character ranges ("3 to 5", "three to five", "from a to z")
  const numWord = '(?:\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
  let protectedBody = body.replace(
    new RegExp(`\\b(${numWord})\\s+to\\s+(${numWord})\\b`, 'gi'),
    '$1__RANGE_TO__$2'
  );
  protectedBody = protectedBody.replace(/\b(from\s+\S+)\s+to\s+(\S+)\b/gi, '$1__RANGE_TO__$2');

  // Protect tight modifier prepositions ("starting with <token>", "ending with <token>", "beginning with <token>")
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
  const separators = [
    /\s+(?:with|into)\s+/gi,
    /\s+(?:to|by)\s+/gi
  ];

  for (const sepRegex of separators) {
    const matches = Array.from(protectedBody.matchAll(sepRegex));
    if (matches.length > 0) {
      // Split on the first separator if it's "with"/"into", or last if multiple
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

function restoreProtectedTokens(str: string): string {
  return str
    .replace(/__RANGE_TO__/g, ' to ')
    .replace(/__MOD_WITH__/g, ' with ')
    .trim();
}

export function parseQueryClauses(rawPrompt: string): ParsedQuery {
  const raw = rawPrompt.trim();
  const { masked: initialMasked, quotes } = maskQuotedLiterals(raw);
  let working = initialMasked.trim();

  const flags = {
    caseInsensitive: false,
    multiline: false
  };
  let preferredAction: ExecutionAction | undefined;
  let locationHint: ParsedQuery['locationHint'];
  let nonGreedyHint = false;
  let exclusionClause: string | undefined;
  const conditions: LookaroundCondition[] = [];

  // 1. Strip polite conversational prefixes
  working = working.replace(/^(?:please\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+|i\s+want\s+to\s+|i\s+need\s+to\s+)/i, '').trim();

  // 2. Strip trailing sentence period only if multi-word sentence and not a literal '.' target
  if (
    working.split(/\s+/).length >= 3 &&
    /[a-zA-Z0-9)_"']\.$/.test(working) &&
    !/\b(?:with|to|into|find|select|sel|get|delete|del|rm|rep|match)\s+\.$/.test(working)
  ) {
    working = working.slice(0, -1).trim();
  }

  // 3. Detect case-insensitivity flags
  if (/\b(?:case[- ]insensitive(?:ly)?|ignore\s+case|regardless\s+of\s+case|any\s+case)\b/i.test(working)) {
    flags.caseInsensitive = true;
    working = working
      .replace(/,?\s*\b(?:case[- ]insensitive(?:ly)?|ignore\s+case|regardless\s+of\s+case|in\s+any\s+case)\b/gi, '')
      .trim();
  }

  // 4. Strip parenthetical lookaround reminders like "(don't include the dollar sign in the selection)"
  working = working
    .replace(/\s*\((?:don't|do\s+not|without)\s+(?:include|including|select|selecting|consume|consuming|grab|grabbing)[^)]*\)/gi, '')
    .trim();

  // 5. Detect non-greedy / single-line span constraints (e.g., Example #13)
  if (/\b(?:but\s+only\s+grab\s+what's\s+between\s+the\s+first|without\s+grabbing\s+across|non-greedily|non\s+greedy|lazily|lazy)\b/i.test(working)) {
    nonGreedyHint = true;
    working = working
      .replace(/,?\s*but\s+only\s+grab\s+what's\s+between\s+the\s+first\b.*$/i, '')
      .replace(/,?\s*\b(?:non-greedily|lazily)\b/gi, '')
      .trim();
  }

  // 6. Strip inline illustrative examples ", like <title>Home</title>," when preceded by a noun
  working = working
    .replace(/,\s*(?:like|such\s+as|for\s+example|e\.g\.)\s+__Q\d+__\s*,?/gi, ' ')
    .replace(/\s+\((?:like|such\s+as|e\.g\.)\s+[^)]+\)/gi, '')
    .trim();

  // 7. Extract trailing "but don't touch words like ..." (signals whole-word boundary)
  if (/,?\s*but\s+(?:don't|do\s+not)\s+(?:touch|match|change|affect)\s+words?\s+like\b/i.test(working)) {
    locationHint = 'whole-word';
    working = working.replace(/,?\s*but\s+(?:don't|do\s+not)\s+(?:touch|match|change|affect)\s+words?\s+like\b.*$/i, '').trim();
  }

  // 8. Extract middle-of-word location constraint (Example #20)
  if (/,?\s*(?:but\s+)?(?:only\s+)?(?:when|if|where)\s+(?:they|it)\s+(?:appear|appears|is|are|occur|occurs)\s+(?:in\s+the\s+middle\s+of\s+a\s+word|inside\s+a\s+word)/i.test(working) ||
      /\bin\s+the\s+middle\s+of\s+a\s+word\b|\binside\s+a\s+word\b/i.test(working)) {
    locationHint = 'middle-of-word';
    working = working
      .replace(/,?\s*(?:but\s+)?(?:only\s+)?(?:when|if|where)\s+(?:they|it)\s+(?:appear|appears|is|are|occur|occurs)\s+(?:in\s+the\s+middle\s+of\s+a\s+word|inside\s+a\s+word).*$/i, '')
      .replace(/\s+(?:in\s+the\s+middle\s+of\s+a\s+word|inside\s+a\s+word)\b/i, '')
      .trim();
  }

  // 9. Extract exclusion clauses (", but ignore ...", ", except ...")
  const exclusionMatch = working.match(/,?\s*(?:but\s+(?:ignore|exclude|skip|not)|ignoring|excluding|except\s+for|except)\s+(.+)$/i);
  if (exclusionMatch) {
    exclusionClause = unmaskQuotes(exclusionMatch[1].trim(), quotes);
    working = working.slice(0, exclusionMatch.index).trim();
  }

  // 10. Extract Lookbehind and Lookahead Condition Clauses
  // 10a: "but only if they have <X> directly in front of them" (Example #10)
  const onlyIfInFrontMatch = working.match(
    /,?\s*(?:but\s+)?(?:only\s+)?if\s+(?:they|it)\s+(?:have|has)\s+(.+?)\s+(?:directly\s+|immediately\s+)?(?:in\s+front\s+of\s+(?:them|it)|before\s+(?:them|it))$/i
  );
  if (onlyIfInFrontMatch) {
    conditions.push({
      type: 'preceded-by',
      targetPhrase: unmaskQuotes(onlyIfInFrontMatch[1].trim(), quotes)
    });
    working = working.slice(0, onlyIfInFrontMatch.index).trim();
  }

  // 10b: Negative lookahead: "that isn't / is not / not immediately followed by <X>" (Example #11)
  const notFollowedMatch = working.match(
    /\s+(?:that\s+|which\s+)?(?:isn't|is\s+not|aren't|are\s+not|not)\s+(?:immediately\s+|directly\s+)?followed\s+by\s+(.+)$/i
  );
  if (notFollowedMatch) {
    conditions.push({
      type: 'not-followed-by',
      targetPhrase: unmaskQuotes(notFollowedMatch[1].trim(), quotes)
    });
    working = working.slice(0, notFollowedMatch.index).trim();
  }

  // 10c: Positive lookahead: "(that is/are) (immediately) followed by <X>"
  const followedMatch = working.match(
    /\s+(?:that\s+(?:is|are)\s+|which\s+(?:is|are)\s+)?(?:immediately\s+|directly\s+)?followed\s+by\s+(.+)$/i
  );
  if (followedMatch) {
    conditions.push({
      type: 'followed-by',
      targetPhrase: unmaskQuotes(followedMatch[1].trim(), quotes)
    });
    working = working.slice(0, followedMatch.index).trim();
  }

  // 10d: Negative lookbehind: "(that isn't / is not / not) (immediately) preceded by <X>"
  const notPrecededMatch = working.match(
    /\s+(?:that\s+|which\s+)?(?:isn't|is\s+not|aren't|are\s+not|not)\s+(?:immediately\s+|directly\s+)?(?:preceded\s+by|after)\s+(.+)$/i
  );
  if (notPrecededMatch) {
    conditions.push({
      type: 'not-preceded-by',
      targetPhrase: unmaskQuotes(notPrecededMatch[1].trim(), quotes)
    });
    working = working.slice(0, notPrecededMatch.index).trim();
  }

  // 10e: Positive lookbehind: "(that is/are) (immediately) preceded by <X>"
  const precededMatch = working.match(
    /\s+(?:that\s+(?:is|are)\s+|which\s+(?:is|are)\s+)?(?:immediately\s+|directly\s+)?preceded\s+by\s+(.+)$/i
  );
  if (precededMatch) {
    conditions.push({
      type: 'preceded-by',
      targetPhrase: unmaskQuotes(precededMatch[1].trim(), quotes)
    });
    working = working.slice(0, precededMatch.index).trim();
  }

  // 11. Detect Explicit Cursor / Clipboard / Extraction UI Actions
  const caretStartMatch = working.match(
    /^(?:place|put|add|set)\s+(?:a\s+|an\s+|individual\s+|multi-?)?(?:carets?|cursors?)\s+(?:at\s+(?:the\s+)?(?:start|beginning)\s+of|before|in\s+front\s+of)\s+(.+)$/i
  );
  if (caretStartMatch) {
    return {
      raw,
      intent: 'FIND',
      targetClause: caretStartMatch[1].trim(),
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags,
      preferredAction: 'carets-at-start',
      quotes
    };
  }

  const caretEndMatch = working.match(
    /^(?:place|put|add|set)\s+(?:a\s+|an\s+|individual\s+|multi-?)?(?:carets?|cursors?)\s+(?:at\s+(?:the\s+)?end\s+of|after|behind)\s+(.+)$/i
  );
  if (caretEndMatch) {
    return {
      raw,
      intent: 'FIND',
      targetClause: caretEndMatch[1].trim(),
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags,
      preferredAction: 'carets-at-end',
      quotes
    };
  }

  if (/^(?:copy|cp)\s+/i.test(working)) {
    preferredAction = 'copy-matches';
    working = working.replace(/^(?:copy|cp)\s+/i, 'find ');
  } else if (/^(?:select|sel|get)\b/i.test(working)) {
    preferredAction = 'select-matches';
  }

  // 12. Check Compound "Find <X> and delete/replace <Y>"
  const findAndDeleteMatch = working.match(
    /^(?:find|match|select|sel|locate|get|grab)\s+(.+?)\s+and\s+(?:delete|del|rm|remove|strip|erase)\s+(.+)$/i
  );
  if (findAndDeleteMatch) {
    const targetPart = findAndDeleteMatch[1].trim();
    const deleteTarget = findAndDeleteMatch[2].trim();
    // Example #9: "Find any word that is accidentally typed twice in a row and delete the second one"
    if (/^(?:the\s+second\s+one|the\s+duplicate|the\s+repeated\s+one|it|them)$/i.test(deleteTarget)) {
      return {
        raw,
        intent: 'DELETE',
        targetClause: targetPart,
        replacementClause: '',
        conditions,
        exclusionClause,
        locationHint,
        nonGreedyHint,
        flags,
        preferredAction: 'replace-all',
        quotes
      };
    }
  }

  const findAndReplaceMatch = working.match(
    /^(?:find|match|select|sel|locate|get|grab)\s+(.+?)\s+and\s+(?:replace|rep|sub|chg|change|substitute|turn)\s+(?:it\s+|them\s+)?(?:with|to|into|by)\s+(.+)$/i
  );
  if (findAndReplaceMatch) {
    return {
      raw,
      intent: 'REPLACE',
      targetClause: findAndReplaceMatch[1].trim(),
      replacementClause: findAndReplaceMatch[2].trim(),
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags,
      preferredAction: 'replace-all',
      quotes
    };
  }

  // 13. Check EXTRACT_CAPTURE Intent (Example #15: "Extract the domain part of an email address into named variables")
  const extractNamedMatch = working.match(
    /^(?:extract|capture|parse|split)\s+(.+?)\s+into\s+(?:named\s+)?(?:variables?|groups?|captures?)$/i
  );
  if (extractNamedMatch) {
    return {
      raw,
      intent: 'EXTRACT_CAPTURE',
      targetClause: extractNamedMatch[1].trim(),
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags,
      preferredAction,
      quotes
    };
  }

  // 14. Check WRAP Intent
  // 14a: "Put/add <wrapper> around <target>" (Example #2)
  const putAroundMatch = working.match(/^(?:put|add|place)\s+(.+?)\s+around\s+(.+)$/i);
  if (putAroundMatch) {
    return {
      raw,
      intent: 'WRAP',
      targetClause: putAroundMatch[2].trim(),
      replacementClause: putAroundMatch[1].trim(),
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags,
      preferredAction: 'replace-all',
      quotes
    };
  }

  // 14b: "Wrap/surround/enclose <target> in/with <wrapper>" (Example #12)
  const wrapInMatch = working.match(
    /^(?:wrap|surround|enclose)\s+(.+?)\s+(?:in|with|inside|within|into|using)\s+(.+?)(?:\s+without\s+losing.*)?$/i
  );
  if (wrapInMatch) {
    return {
      raw,
      intent: 'WRAP',
      targetClause: wrapInMatch[1].trim(),
      replacementClause: wrapInMatch[2].trim(),
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags,
      preferredAction: 'replace-all',
      quotes
    };
  }

  // 15. Check INSERT_ADD Intent
  // 15a: "Add/append/put/insert <Y> to/at the end (of <X> | per | per line)" (Example #5)
  const addEndMatch = working.match(
    /^(?:add|append|app|put|insert|ins)\s+(.+?)\s+(?:to|at|on|onto)\s+(?:the\s+)?end(?:\s+(?:of\s+(.+)|per|per[-\s]lines?))?$/i
  );
  if (addEndMatch) {
    let target = (addEndMatch[2] ?? 'every line').trim();
    let missingCheck = false;
    if (/\b(?:that\s+)?(?:doesn't|does\s+not|don't|do\s+not|without|lacking|missing)\s+(?:already\s+)?(?:have|end\s+with)\b/i.test(target)) {
      missingCheck = true;
      target = target
        .replace(/\s+(?:that\s+)?(?:doesn't|does\s+not|don't|do\s+not|without|lacking|missing)\s+(?:already\s+)?(?:have|end\s+with).*$/i, '')
        .trim();
    }
    return {
      raw,
      intent: 'INSERT_ADD',
      targetClause: target,
      replacementClause: addEndMatch[1].trim(),
      insertPosition: 'end-of-line',
      missingCheck,
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags: { ...flags, multiline: true },
      preferredAction: 'replace-all',
      quotes
    };
  }

  // 15b: "Add/prepend/put/insert <Y> to/at the start/beginning (of <X> | per | per line)"
  const addStartMatch = working.match(
    /^(?:add|prepend|prep|put|insert|ins)\s+(.+?)\s+(?:to|at|on|in)\s+(?:the\s+)?(?:start|beginning|front)(?:\s+(?:of\s+(.+)|per|per[-\s]lines?))?$/i
  );
  if (addStartMatch) {
    let target = (addStartMatch[2] ?? 'every line').trim();
    let missingCheck = false;
    if (/\b(?:that\s+)?(?:doesn't|does\s+not|don't|do\s+not|without|lacking|missing)\s+(?:already\s+)?(?:have|start\s+with)\b/i.test(target)) {
      missingCheck = true;
      target = target
        .replace(/\s+(?:that\s+)?(?:doesn't|does\s+not|don't|do\s+not|without|lacking|missing)\s+(?:already\s+)?(?:have|start\s+with).*$/i, '')
        .trim();
    }
    return {
      raw,
      intent: 'INSERT_ADD',
      targetClause: target,
      replacementClause: addStartMatch[1].trim(),
      insertPosition: 'start-of-line',
      missingCheck,
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags: { ...flags, multiline: true },
      preferredAction: 'replace-all',
      quotes
    };
  }

  // 15c: "Prepend/prep <Y> (to <X> | per | per line)" / "Append/app <Y> (to <X> | per | per line)"
  const prependToMatch = working.match(/^(?:prepend|prep)\s+(.+?)\s+(?:to\s+(.+)|per|per[-\s]lines?)$/i);
  if (prependToMatch) {
    return {
      raw,
      intent: 'INSERT_ADD',
      targetClause: (prependToMatch[2] ?? 'every line').trim(),
      replacementClause: prependToMatch[1].trim(),
      insertPosition: 'start-of-line',
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags: { ...flags, multiline: true },
      preferredAction: 'replace-all',
      quotes
    };
  }

  const appendToMatch = working.match(/^(?:append|app)\s+(.+?)\s+(?:to\s+(.+)|per|per[-\s]lines?)$/i);
  if (appendToMatch) {
    return {
      raw,
      intent: 'INSERT_ADD',
      targetClause: (appendToMatch[2] ?? 'every line').trim(),
      replacementClause: appendToMatch[1].trim(),
      insertPosition: 'end-of-line',
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags: { ...flags, multiline: true },
      preferredAction: 'replace-all',
      quotes
    };
  }

  // 15d: "Insert/ins/add/put <Y> before/after <X>"
  const insertRelMatch = working.match(
    /^(?:insert|ins|add|put)\s+(.+?)\s+(before|in\s+front\s+of|after|behind|following)\s+(.+)$/i
  );
  if (insertRelMatch) {
    const isBefore = /^(?:before|in\s+front\s+of)$/i.test(insertRelMatch[2].trim());
    return {
      raw,
      intent: 'INSERT_ADD',
      targetClause: insertRelMatch[3].trim(),
      replacementClause: insertRelMatch[1].trim(),
      insertPosition: isBefore ? 'before-target' : 'after-target',
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags,
      preferredAction: 'replace-all',
      quotes
    };
  }

  // 16. Check SWAP_REORDER Intent (Example #8: "Swap first and last names in this comma-separated list")
  const swapMatch = working.match(/^(?:swap|reverse|switch|flip|exchange)\s+(.+)$/i);
  if (swapMatch && !/\s+with\s+/i.test(swapMatch[1])) {
    return {
      raw,
      intent: 'SWAP_REORDER',
      targetClause: swapMatch[1].trim(),
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags,
      preferredAction: 'replace-all',
      quotes
    };
  }

  // 17. Check CASE_TRANSFORM Intent
  // 17a: "Capitalize/cap <target>" (Example #17: "Capitalize the very first letter of every line")
  const capitalizeMatch = working.match(/^(?:capitalize|cap|title[- ]?case)\s+(.+)$/i);
  if (capitalizeMatch) {
    return {
      raw,
      intent: 'CASE_TRANSFORM',
      targetClause: capitalizeMatch[1].trim(),
      caseTargetMode: 'capitalize-first',
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags,
      preferredAction: 'replace-all',
      quotes
    };
  }

  const upperVerbMatch = working.match(/^(?:uppercase|upper[- ]case|upper)\s+(.+)$/i);
  if (upperVerbMatch) {
    return {
      raw,
      intent: 'CASE_TRANSFORM',
      targetClause: upperVerbMatch[1].trim(),
      caseTargetMode: 'upper',
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags,
      preferredAction: 'replace-all',
      quotes
    };
  }

  const lowerVerbMatch = working.match(/^(?:lowercase|lower[- ]case|lower|uncapitalize|uncap)\s+(.+)$/i);
  if (lowerVerbMatch) {
    return {
      raw,
      intent: 'CASE_TRANSFORM',
      targetClause: lowerVerbMatch[1].trim(),
      caseTargetMode: 'lower',
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags,
      preferredAction: 'replace-all',
      quotes
    };
  }

  // 17b: "Make <target> <CaseMode>" (Example #18: "Make all markdown section headers (# header) Title Case")
  const makeCaseMatch = working.match(
    /^make\s+(.+?)\s+(title\s*case|uppercase|upper\s+case|all\s+caps|caps|lowercase|lower\s+case|camel\s*case|pascal\s*case|snake[_\s]case|screaming[_\s]snake[_\s]case|kebab[-\s]case|capitalized)$/i
  );
  if (makeCaseMatch) {
    const mode = parseCaseTransformMode(makeCaseMatch[2], quotes);
    if (mode) {
      return {
        raw,
        intent: 'CASE_TRANSFORM',
        targetClause: makeCaseMatch[1].trim(),
        caseTargetMode: mode,
        conditions,
        exclusionClause,
        locationHint,
        nonGreedyHint,
        flags,
        preferredAction: 'replace-all',
        quotes
      };
    }
  }

  // 18. Check REPLACE Intent ("replace/rep/sub/chg/change/convert/turn/substitute/transform/switch/swap <X> with/to/into <Y>")
  // Handle "substitute <Y> for <X>" specifically
  const substituteForMatch = working.match(/^(?:substitute|sub)\s+(.+?)\s+for\s+(.+)$/i);
  if (substituteForMatch && !/\s+with\s+/i.test(working)) {
    return {
      raw,
      intent: 'REPLACE',
      targetClause: substituteForMatch[2].trim(),
      replacementClause: substituteForMatch[1].trim(),
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags,
      preferredAction: 'replace-all',
      quotes
    };
  }

  const replaceVerbMatch = working.match(
    /^(?:replace|rep|sub|chg|change|convert|turn|transform|substitute|translate|switch|swap)\s+(.+)$/i
  );
  if (replaceVerbMatch) {
    const split = splitTargetAndReplacement(replaceVerbMatch[1].trim());
    if (split) {
      const maybeCaseMode = parseCaseTransformMode(split.replacement, quotes);
      if (maybeCaseMode) {
        return {
          raw,
          intent: 'CASE_TRANSFORM',
          targetClause: split.target,
          caseTargetMode: maybeCaseMode,
          conditions,
          exclusionClause,
          locationHint,
          nonGreedyHint,
          flags,
          preferredAction: 'replace-all',
          quotes
        };
      }

      return {
        raw,
        intent: 'REPLACE',
        targetClause: split.target,
        replacementClause: split.replacement,
        conditions,
        exclusionClause,
        locationHint,
        nonGreedyHint,
        flags,
        preferredAction: 'replace-all',
        quotes
      };
    }
  }

  // 19. Check DELETE Intent ("delete/del/rm/remove/strip/erase/clear/drop/omit/collapse/trim <X>")
  const trimVerbMatch = working.match(/^trim(?:\s+(.+))?$/i);
  if (trimVerbMatch) {
    const rest = trimVerbMatch[1]?.trim() ?? '';
    const isLineTrim = !rest || /^(?:all\s+|every\s+|each\s+|the\s+)?(?:lines?|whitespace|spaces?|rows?|per|per[-\s]lines?)$/i.test(rest);
    return {
      raw,
      intent: 'DELETE',
      targetClause: isLineTrim ? 'leading and trailing whitespace' : rest,
      replacementClause: '',
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags: { ...flags, multiline: true },
      preferredAction: 'replace-all',
      quotes
    };
  }

  const deleteVerbMatch = working.match(
    /^(?:delete|del|rm|remove|strip(?:\s+out)?|erase|clear|clr|drop|omit|eliminate|wipe|scrub|get\s+rid\s+of|collapse)\s+(.+)$/i
  );
  if (deleteVerbMatch) {
    return {
      raw,
      intent: 'DELETE',
      targetClause: deleteVerbMatch[1].trim(),
      replacementClause: '',
      conditions,
      exclusionClause,
      locationHint,
      nonGreedyHint,
      flags,
      preferredAction: 'replace-all',
      quotes
    };
  }

  // 20. Check FIND Intent (explicit find/match/select/sel/get/locate/give me verb, or bare noun phrase)
  const findVerbMatch = working.match(
    /^(?:find|fnd|match|select|sel|locate|search\s+for|search|highlight|grab|get|give\s+me|show\s+me|show|look\s+for|pick|identify|capture|extract)\s+(.+)$/i
  );
  const targetClause = findVerbMatch ? findVerbMatch[1].trim() : working;

  return {
    raw,
    intent: 'FIND',
    targetClause,
    conditions,
    exclusionClause,
    locationHint,
    nonGreedyHint,
    flags,
    preferredAction,
    quotes
  };
}
