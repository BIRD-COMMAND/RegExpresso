import { CompiledRegexResult, ParsedQuery } from '../../types';
import { unmaskQuotes } from '../../grammar/tokens';
import { resolveWrapperSpec } from '../../lexicon';
import { resolveReplacementClause, resolveTargetClause } from '../../resolvers';
import { applyLookaroundsAndExclusions, buildFlagsString } from '../lookaroundApplier';

export function handleReplaceIntent(parsed: ParsedQuery): CompiledRegexResult {
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

export function handleWrapIntent(parsed: ParsedQuery): CompiledRegexResult {
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
