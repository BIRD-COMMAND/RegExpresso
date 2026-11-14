import { ResolvedTarget } from '../types';
import { resolveBlockSpec } from '../lexicon';

/**
 * Resolves `<delimiter> block(s)` or `block(s) in/of/with <delimiter>` (which INCLUDE the surrounding delimiters).
 */
export function tryResolveBlock(phrase: string, quotes: string[]): ResolvedTarget | null {
  if (/^blocks?$/i.test(phrase)) {
    return {
      pattern: '(?:\\([^)\\r\\n]*\\)|\\[[^\\]\\r\\n]*\\]|\\{[^}\\r\\n]*\\})',
      label: 'delimited blocks (parentheses, brackets, or braces)',
      features: ['Delimited block alternation ((...)|[...]|{...})'],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  const blockMatch = phrase.match(
    /^(?:(.+?)\s+blocks?|blocks?\s+(?:in|inside(?:[\s_]of)?|within|between|of|with|enclosed[\s_]+(?:in|by|with)|surrounded[\s_]+(?:in|by|with)|wrapped[\s_]+(?:in|by|with))\s+(.+))$/i
  );
  if (!blockMatch) return null;

  const delimPhrase = (blockMatch[1] ?? blockMatch[2]).trim();
  const spec = resolveBlockSpec(delimPhrase, quotes);
  if (!spec) return null;

  return {
    pattern: spec.pattern,
    label: spec.label,
    features: spec.features,
    needsMultiline: false,
    needsCaseInsensitive: false
  };
}
