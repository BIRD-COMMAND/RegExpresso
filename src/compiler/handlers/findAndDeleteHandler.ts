import { CompiledRegexResult, ParsedQuery } from '../../types';
import { resolveTargetClause } from '../../resolvers';
import { applyLookaroundsAndExclusions, buildFlagsString } from '../lookaroundApplier';

export function handleFindIntent(parsed: ParsedQuery): CompiledRegexResult {
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
    preferredAction:
      parsed.preferredAction ?? (includeExtractReplace ? 'select-matches' : undefined)
  };
}

export function handleDeleteIntent(parsed: ParsedQuery): CompiledRegexResult {
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
