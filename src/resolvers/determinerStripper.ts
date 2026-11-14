import { extractPerLineSuffix } from '../grammar/patterns';

export interface StrippedTargetHints {
  cleaned: string;
  wholeWordHint: boolean;
  startOfLineHint: boolean;
  endOfLineHint: boolean;
}

const DETERMINER_PREFIX_PATTERNS: { regex: RegExp; setsWholeWord?: boolean }[] = [
  {
    regex:
      /^(?:all\s+|every\s+|each\s+|any\s+)?(?:whole|exact|complete|full|standalone)\s+words?\s+(?:that\s+(?:say|are|match|equal)|saying|matching|called|named)\s+/i,
    setsWholeWord: true
  },
  {
    regex:
      /^(?:all\s+|every\s+|each\s+|any\s+)?words?\s+(?:that\s+(?:say|are|match|equal)|saying|matching|called|named)\s+/i,
    setsWholeWord: true
  },
  {
    regex: /^(?:all\s+|every\s+|each\s+|any\s+)?(?:the\s+)?(?:whole|exact|complete|standalone)\s+words?\s+/i,
    setsWholeWord: true
  },
  {
    regex: /^(?:every|each|all|any)\s+(?:single\s+)?(?:instances?|occurrences?|places?|matches?)\s+of\s+/i,
    setsWholeWord: true
  },
  {
    regex: /^(?:instances?|occurrences?)\s+of\s+/i,
    setsWholeWord: true
  },
  {
    regex: /^(?:all\s+of\s+the|all\s+the|all|every|each|any)\s+/i
  },
  {
    regex:
      /^(?:the\s+)?(?:exact\s+|literal\s+)?(?:word)\s+(?!that(?:'?s|\s+(?:is|are|isn'?t|aren'?t|starts?|beg[ai]ns?|ends?|contains?|ha(?:ve|s)|do(?:es)?|don'?t|doesn'?t))\b|which\b|typed\b|repeated\b|starting\b|beginning\b|ending\b|containing\b|with\b|without\b|lacking\b|omitting\b|in\b|inside\b|between\b|within\b)/i,
    setsWholeWord: true
  },
  {
    regex:
      /^(?:the\s+)?(?:exact\s+|literal\s+)?(?:string|text|phrase|token|character|char|letter|symbol|value|pattern|regex|regular\s+expression)\s+(?!that(?:'?s|\s+(?:is|are|isn'?t|aren'?t|starts?|beg[ai]ns?|ends?|contains?|ha(?:ve|s)|do(?:es)?|don'?t|doesn'?t))\b|which\b|starting\b|beginning\b|ending\b|containing\b|with\b|without\b|lacking\b|omitting\b|not\b|except\b|other\b|excluding\b|from\b|inside\b|within\b|between\b|in\b|after\b|before\b|enclosed\b|wrapped\b|surrounded\b)/i
  },
  {
    regex: /^(?:the|a|an|some)\s+/i
  }
];

/**
 * Strips leading determiners/classifiers ("all", "every", "the", "a", "an", "whole words that say", etc.)
 * and extracts positional/boundary hints ("leading", "trailing", "at the start of every line", "standalone")
 * ONLY when stripping them leaves a non-empty remainder.
 */
export function stripDeterminersAndClassifiers(input: string): StrippedTargetHints {
  let s = input.trim();
  let wholeWordHint = false;
  let startOfLineHint = false;
  let endOfLineHint = false;

  // Detect trailing "without letters attached" / "as a whole word" / "standalone"
  if (/\s+(?:without\s+letters?\s+attached|as\s+(?:a\s+)?whole\s+words?|standalone)\b/i.test(s)) {
    wholeWordHint = true;
    s = s
      .replace(/\s+(?:without\s+letters?\s+attached|as\s+(?:a\s+)?whole\s+words?|standalone)\b/gi, '')
      .trim();
  }

  // Detect trailing "in this text / file / document / list / column / string"
  if (/\s+in\s+(?:this|the)\s+(?:text|file|document|string|input|code|list|editor)$/i.test(s)) {
    s = s
      .replace(/\s+in\s+(?:this|the)\s+(?:text|file|document|string|input|code|list|editor)$/i, '')
      .trim();
  }

  // Detect trailing "at (the) start/beginning (of every line | per | per line)"
  const startLineRegex =
    /\s+at\s+(?:the\s+)?(?:start|beginning)(?:\s+(?:per|per[-\s]lines?|(?:of|on|in|for)\s+(?:every\s+|each\s+|all\s+|a\s+|the\s+)?lines?))?$/i;
  if (startLineRegex.test(s)) {
    startOfLineHint = true;
    s = s.replace(startLineRegex, '').trim();
  }

  // Detect trailing "at (the) end (of every line | per | per line)"
  const endLineRegex =
    /\s+at\s+(?:the\s+)?end(?:\s+(?:per|per[-\s]lines?|(?:of|on|in|for)\s+(?:every\s+|each\s+|all\s+|a\s+|the\s+)?lines?))?$/i;
  if (endLineRegex.test(s)) {
    endOfLineHint = true;
    s = s.replace(endLineRegex, '').trim();
  }

  // Iteratively strip multi-word prefixes if remainder is non-empty
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of DETERMINER_PREFIX_PATTERNS) {
      const m = s.match(p.regex);
      if (m) {
        const remainder = s.slice(m[0].length).trim();
        if (remainder.length > 0) {
          s = remainder;
          if (p.setsWholeWord) wholeWordHint = true;
          changed = true;
          break;
        }
      }
    }
  }

  // Strip trailing per-line scope modifiers ("per", "per line", "on every line", etc.),
  // except on "first/last ..." phrases where `tryResolveAffixOrLineFilter` inspects `hasPerLine`
  if (!/^(?:the\s+)?(?:first|last)\b/i.test(s)) {
    const perExtracted = extractPerLineSuffix(s);
    if (perExtracted.hasPerLine) {
      s = perExtracted.cleaned;
    }
  }

  const leadingModMatch = s.match(
    /^leading\s+(?!and\s+trailing\b|whitespace\b|white[\s_]+space\b|spaces?\b|indentation\b|indent\b)(.+)$/i
  );
  if (leadingModMatch) {
    startOfLineHint = true;
    s = leadingModMatch[1].trim();
  }

  const trailingModMatch = s.match(/^trailing\s+(?!whitespace\b|white[\s_]+space\b|spaces?\b)(.+)$/i);
  if (trailingModMatch) {
    endOfLineHint = true;
    s = trailingModMatch[1].trim();
  }

  return { cleaned: s, wholeWordHint, startOfLineHint, endOfLineHint };
}

export function finalizeLineAnchors(
  pattern: string,
  startOfLine: boolean,
  endOfLine: boolean,
  features: string[]
): string {
  let res = pattern;
  if (startOfLine && !res.startsWith('^')) {
    res = `^${res}`;
    features.push('Start-of-line anchor (^) ');
  }
  if (endOfLine && !res.endsWith('$')) {
    res = `${res}$`;
    features.push('End-of-line anchor ($)');
  }
  return res;
}
