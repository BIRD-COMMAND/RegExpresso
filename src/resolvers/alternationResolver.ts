import { ResolvedTarget } from '../types';
import { unmaskQuotes } from '../grammar/tokens';
import {
  findLexiconEntry,
  synthesizeTwoWordVariantPattern,
  US_UK_SPELLING_MAP
} from '../lexicon';
import { stripDeterminersAndClassifiers } from './determinerStripper';
import { resolveRawLiteralOrCharClass } from './primitiveResolver';

/**
 * Resolves American/British spelling variants or "either X or Y" / "X or Y".
 */
export function tryResolveAlternationOrVariant(
  phrase: string,
  quotes: string[],
  wholeWordHint: boolean,
  quantifier: string
): ResolvedTarget | null {
  // Example #6: "'color' whether it's spelled the American way or British way ('colour')"
  if (/\b(?:american|british)\b.*\b(?:spelled|spelling|way)\b/i.test(phrase)) {
    const qMatches = Array.from(phrase.matchAll(/__Q(\d+)__/g)).map(
      (m) => quotes[parseInt(m[1], 10)]
    );
    if (qMatches.length >= 2) {
      const v = synthesizeTwoWordVariantPattern(qMatches[0], qMatches[1], true);
      return {
        pattern: v.pattern,
        label: `'${qMatches[0]}' or '${qMatches[1]}'`,
        features: v.features,
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
    if (qMatches.length === 1) {
      const w = qMatches[0].toLowerCase();
      const pair = US_UK_SPELLING_MAP[w];
      if (pair) {
        const v = synthesizeTwoWordVariantPattern(pair[0], pair[1], true);
        return {
          pattern: v.pattern,
          label: `'${pair[0]}' or '${pair[1]}'`,
          features: v.features,
          needsMultiline: false,
          needsCaseInsensitive: false
        };
      }
    }
    // Check unquoted word before "whether"
    const beforeWhether = phrase.split(/\bwhether\b/i)[0].trim();
    const cleanedWord = stripDeterminersAndClassifiers(beforeWhether).cleaned.toLowerCase();
    const pair = US_UK_SPELLING_MAP[cleanedWord];
    if (pair) {
      const v = synthesizeTwoWordVariantPattern(pair[0], pair[1], true);
      return {
        pattern: v.pattern,
        label: `'${pair[0]}' or '${pair[1]}'`,
        features: v.features,
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
  }

  // General "either <A> or <B>", "<A> or <B>", "<A> and <B>" (for character classes), or "<A>, <B>, or <C>"
  if (
    /\s+(?:or|and)\s+/i.test(phrase) &&
    !/\b(?:whether|more|less|between|first\s+and\s+last|opening\s+and\s+closing|leading\s+and\s+trailing)\b/i.test(
      phrase
    )
  ) {
    const cleanedTop = phrase.replace(/^either\s+/i, '').trim();
    const rawParts = cleanedTop
      .split(/\s*(?:,?\s+\b(?:or|and)\b\s+|,\s*)/i)
      .map((p) => stripDeterminersAndClassifiers(p).cleaned)
      .filter(Boolean);

    if (rawParts.length === 2) {
      const [leftRaw, rightRaw] = rawParts;
      const leftEntry = findLexiconEntry(leftRaw);
      const rightEntry = findLexiconEntry(rightRaw);

      if (leftEntry?.charClassChars && rightEntry?.charClassChars) {
        const combined = `[${leftEntry.charClassChars}${rightEntry.charClassChars}]${quantifier}`;
        return {
          pattern: combined,
          label: `${leftEntry.label} or ${rightEntry.label}`,
          features: [`Character class (${combined})`],
          needsMultiline: false,
          needsCaseInsensitive: false
        };
      }

      if (/\s+or\s+/i.test(phrase)) {
        const leftUnmasked = unmaskQuotes(leftRaw, quotes).trim();
        const rightUnmasked = unmaskQuotes(rightRaw, quotes).trim();

        if (
          /^\w+$/.test(leftUnmasked) &&
          /^\w+$/.test(rightUnmasked) &&
          !leftEntry &&
          !rightEntry
        ) {
          const v = synthesizeTwoWordVariantPattern(leftUnmasked, rightUnmasked, wholeWordHint);
          return {
            pattern: v.pattern,
            label: `'${leftUnmasked}' or '${rightUnmasked}'`,
            features: v.features,
            needsMultiline: false,
            needsCaseInsensitive: false
          };
        }

        const p1 = leftEntry
          ? leftEntry.findPattern
          : resolveRawLiteralOrCharClass(leftRaw, quotes);
        const p2 = rightEntry
          ? rightEntry.findPattern
          : resolveRawLiteralOrCharClass(rightRaw, quotes);
        return {
          pattern: `(?:${p1}|${p2})`,
          label: `${leftUnmasked} or ${rightUnmasked}`,
          features: ['Non-capturing alternation ((?:a|b))'],
          needsMultiline: Boolean(leftEntry?.needsMultiline || rightEntry?.needsMultiline),
          needsCaseInsensitive: false
        };
      }
    } else if (rawParts.length > 2) {
      const entries = rawParts.map((p) => findLexiconEntry(p));
      if (entries.every((e) => e && e.charClassChars)) {
        const chars = entries.map((e) => e!.charClassChars).join('');
        const combined = `[${chars}]${quantifier}`;
        return {
          pattern: combined,
          label: rawParts.join(', '),
          features: [`Character class (${combined})`],
          needsMultiline: false,
          needsCaseInsensitive: false
        };
      }
      if (/\s+or\s+/i.test(phrase)) {
        const alts = rawParts.map((p, idx) =>
          entries[idx] ? entries[idx]!.findPattern : resolveRawLiteralOrCharClass(p, quotes)
        );
        return {
          pattern: `(?:${alts.join('|')})`,
          label: rawParts.join(' or '),
          features: ['Non-capturing alternation ((?:a|b|c))'],
          needsMultiline: false,
          needsCaseInsensitive: false
        };
      }
    }
  }

  return null;
}
