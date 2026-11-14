import { CompiledRegexResult, ParsedQuery } from '../../types';
import { extractPerLineSuffix } from '../../grammar/patterns';
import { escapeRegexLiteral, isAtomicRegexUnit, unmaskQuotes } from '../../grammar/tokens';
import { findLexiconEntry } from '../../lexicon';
import { resolveTargetClause } from '../../resolvers';
import { buildFlagsString } from '../lookaroundApplier';

function resolveRepeatableTrimUnit(
  phrase: string,
  quotes: string[]
): { quantPat: string; label: string; features: string[] } {
  const { cleaned } = extractPerLineSuffix(phrase);
  const stripped = cleaned.replace(/^(?:all\s+|every\s+|each\s+|the\s+|a\s+|an\s+)/i, '').trim();

  const singleQuoteMatch = stripped.match(/^__Q(\d+)__$/);
  if (singleQuoteMatch) {
    const lit = quotes[parseInt(singleQuoteMatch[1], 10)];
    const esc = escapeRegexLiteral(lit);
    const quantPat = lit.length === 1 ? `${esc}+` : `(?:${esc})+`;
    return { quantPat, label: `'${lit}'`, features: [`One-or-more quantifier (${quantPat})`] };
  }

  const entry = findLexiconEntry(stripped);
  if (entry) {
    const unit = entry.singleUnitPattern;
    const isAtomic = isAtomicRegexUnit(unit);
    const quantPat = isAtomic ? `${unit}+` : `(?:${unit})+`;
    return {
      quantPat,
      label: entry.label,
      features: [...entry.features, 'One-or-more quantifier (+)']
    };
  }

  const resolved = resolveTargetClause(stripped, quotes);
  const pat = resolved.pattern;
  if (pat.endsWith('+') || pat.endsWith('*')) {
    return { quantPat: pat, label: resolved.label, features: resolved.features };
  }
  const isAtomic = isAtomicRegexUnit(pat);
  const quantPat = isAtomic ? `${pat}+` : `(?:${pat})+`;
  return {
    quantPat,
    label: resolved.label,
    features: [...resolved.features, 'One-or-more quantifier (+)']
  };
}

export function handleTrimIntent(parsed: ParsedQuery): CompiledRegexResult {
  const rawClause = parsed.targetClause.trim();
  const { cleaned } = extractPerLineSuffix(rawClause);
  const target = unmaskQuotes(cleaned, parsed.quotes)
    .replace(/^(?:all\s+|every\s+|each\s+|the\s+)/i, '')
    .trim();

  // 1. "trim blanks" / "trim empties" / "trim blank lines" / "trim empty lines"
  if (/^(?:blanks?|empties|empty|blank\s+lines?|empty\s+lines?)$/i.test(target)) {
    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Remove all blank or whitespace-only lines.',
      steps: [
        {
          description: 'Match blank/empty lines including their line break and delete them',
          find: '^\\s*\\r?\\n',
          replace: '',
          flags: 'gm'
        }
      ],
      featuresUsed: [
        'Line start anchor (^)',
        'Whitespace shorthand (\\s*)',
        'CRLF-safe newline (\\r?\\n)'
      ],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  // 2. "trim multiple/extra/duplicate blank lines"
  if (
    /^(?:(?:multiple|extra|consecutive|duplicate|redundant)\s+(?:blank|empty)\s+lines?|(?:multiple|extra|consecutive)\s+(?:blanks|empties))$/i.test(
      target
    )
  ) {
    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Collapse multiple consecutive blank lines into a single blank line.',
      steps: [
        {
          description: 'Match 3 or more consecutive line breaks and replace with 2 newlines',
          find: '(\\r?\\n){3,}',
          replace: '\\n\\n',
          flags: 'g'
        }
      ],
      featuresUsed: ['Lower-bound quantifier ({3,})', 'Newline escape (\\n)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  // 3. "trim multiple/extra/duplicate spaces"
  if (
    /^(?:(?:multiple|extra|consecutive|duplicate|redundant|double)\s+(?:spaces?|whitespace))$/i.test(
      target
    )
  ) {
    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Collapse multiple consecutive horizontal spaces into a single space.',
      steps: [
        {
          description: 'Match 2 or more spaces/tabs and replace with a single space',
          find: '[ \\t]{2,}',
          replace: ' ',
          flags: 'g'
        }
      ],
      featuresUsed: ['Horizontal whitespace ([ \\t]{2,})'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  // 4. Default line whitespace trim: "trim", "trim lines", "trim whitespace", "trim spaces", "trim per"
  if (
    !target ||
    /^(?:lines?|whitespace|white\s+space|spaces?|rows?|per|per[-\s]lines?|both\s+ends|leading\s+and\s+trailing(?:\s+(?:whitespace|spaces?))?|surrounding\s+(?:whitespace|spaces?))$/i.test(
      target
    )
  ) {
    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Trim leading and trailing horizontal whitespace from every line.',
      steps: [
        {
          description: 'Match leading or trailing spaces/tabs on each line and delete them',
          find: '^[ \\t]+|[ \\t]+$',
          replace: '',
          flags: 'gm'
        }
      ],
      featuresUsed: [
        'Line start/end anchors (^, $)',
        'Alternation (|)',
        'Horizontal whitespace ([ \\t]+)'
      ],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  // 5. Leading whitespace only
  if (
    /^(?:leading(?:\s+(?:whitespace|white\s+space|spaces?))?|start(?:\s+of\s+lines?)?|left|indentation|indent)$/i.test(
      target
    )
  ) {
    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Trim leading horizontal whitespace from the beginning of every line.',
      steps: [
        {
          description: 'Match leading spaces/tabs at start of line and delete them',
          find: '^[ \\t]+',
          replace: '',
          flags: 'gm'
        }
      ],
      featuresUsed: ['Start-of-line anchor (^)', 'Horizontal whitespace ([ \\t]+)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  // 6. Trailing whitespace only
  if (
    /^(?:trailing(?:\s+(?:whitespace|white\s+space|spaces?))?|end(?:\s+of\s+lines?)?|right|line\s+endings?)$/i.test(
      target
    )
  ) {
    return {
      isPossible: true,
      mode: 'replace',
      summary: 'Trim trailing horizontal whitespace from the end of every line.',
      steps: [
        {
          description: 'Match trailing spaces/tabs at end of line and delete them',
          find: '[ \\t]+$',
          replace: '',
          flags: 'gm'
        }
      ],
      featuresUsed: ['End-of-line anchor ($)', 'Horizontal whitespace ([ \\t]+)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  // 7. "trim leading <X>"
  const leadingTargetMatch = cleaned.match(/^(?:all\s+|every\s+|each\s+|the\s+)?leading\s+(.+)$/i);
  if (leadingTargetMatch) {
    const unit = resolveRepeatableTrimUnit(leadingTargetMatch[1].trim(), parsed.quotes);
    const findPat = `^${unit.quantPat}`;
    return {
      isPossible: true,
      mode: 'replace',
      summary: `Trim leading ${unit.label} from the beginning of every line.`,
      steps: [
        {
          description: `Match leading ${unit.label} at start of line and delete`,
          find: findPat,
          replace: '',
          flags: buildFlagsString(parsed, true, false)
        }
      ],
      featuresUsed: ['Start-of-line anchor (^)', ...unit.features],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  // 8. "trim trailing <Y>"
  const trailingTargetMatch = cleaned.match(
    /^(?:all\s+|every\s+|each\s+|the\s+)?trailing\s+(.+)$/i
  );
  if (trailingTargetMatch) {
    const unit = resolveRepeatableTrimUnit(trailingTargetMatch[1].trim(), parsed.quotes);
    const findPat = `${unit.quantPat}$`;
    return {
      isPossible: true,
      mode: 'replace',
      summary: `Trim trailing ${unit.label} from the end of every line.`,
      steps: [
        {
          description: `Match trailing ${unit.label} at end of line and delete`,
          find: findPat,
          replace: '',
          flags: buildFlagsString(parsed, true, false)
        }
      ],
      featuresUsed: ['End-of-line anchor ($)', ...unit.features],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  // 9. "trim <X>" (both leading and trailing <X> on every line)
  const unit = resolveRepeatableTrimUnit(cleaned, parsed.quotes);
  const findPat = `^${unit.quantPat}|${unit.quantPat}$`;
  return {
    isPossible: true,
    mode: 'replace',
    summary: `Trim leading and trailing ${unit.label} from every line.`,
    steps: [
      {
        description: `Match leading or trailing ${unit.label} on each line and delete`,
        find: findPat,
        replace: '',
        flags: buildFlagsString(parsed, true, false)
      }
    ],
    featuresUsed: ['Line start/end anchors (^, $)', 'Alternation (|)', ...unit.features],
    confidence: 'high',
    preferredAction: 'replace-all'
  };
}
