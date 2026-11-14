import { escapeCharClassLiteral, escapeRegexLiteral } from '../grammar/tokens';

export const US_UK_SPELLING_MAP: Record<string, [string, string]> = {
  color: ['color', 'colour'],
  colour: ['color', 'colour'],
  flavor: ['flavor', 'flavour'],
  flavour: ['flavor', 'flavour'],
  honor: ['honor', 'honour'],
  honour: ['honor', 'honour'],
  behavior: ['behavior', 'behaviour'],
  behaviour: ['behavior', 'behaviour'],
  labor: ['labor', 'labour'],
  labour: ['labor', 'labour'],
  neighbor: ['neighbor', 'neighbour'],
  neighbour: ['neighbor', 'neighbour'],
  favor: ['favor', 'favour'],
  favour: ['favor', 'favour'],
  center: ['center', 'centre'],
  centre: ['center', 'centre'],
  meter: ['meter', 'metre'],
  metre: ['meter', 'metre'],
  theater: ['theater', 'theatre'],
  theatre: ['theater', 'theatre'],
  organize: ['organize', 'organise'],
  organise: ['organize', 'organise'],
  analyze: ['analyze', 'analyse'],
  analyse: ['analyze', 'analyse'],
  realize: ['realize', 'realise'],
  realise: ['realize', 'realise'],
  license: ['license', 'licence'],
  licence: ['license', 'licence'],
  defense: ['defense', 'defence'],
  defence: ['defense', 'defence'],
  gray: ['gray', 'grey'],
  grey: ['gray', 'grey'],
  catalog: ['catalog', 'catalogue'],
  catalogue: ['catalog', 'catalogue'],
  dialog: ['dialog', 'dialogue'],
  dialogue: ['dialog', 'dialogue']
};

export function synthesizeTwoWordVariantPattern(
  w1: string,
  w2: string,
  wholeWord = true
): { pattern: string; summary: string; features: string[] } {
  const b = wholeWord ? '\\b' : '';
  const features: string[] = [];
  if (wholeWord) features.push('Word boundary (\\b)');

  // Case 1: One word has 1 extra character inserted (e.g., color vs colour)
  const longer = w1.length >= w2.length ? w1 : w2;
  const shorter = w1.length >= w2.length ? w2 : w1;
  if (longer.length - shorter.length === 1) {
    for (let i = 0; i < longer.length; i++) {
      if (longer.slice(0, i) + longer.slice(i + 1) === shorter) {
        const prefix = escapeRegexLiteral(longer.slice(0, i));
        const optChar = escapeRegexLiteral(longer[i]);
        const suffix = escapeRegexLiteral(longer.slice(i + 1));
        features.push('Zero-or-one quantifier (?)');
        return {
          pattern: `${b}${prefix}${optChar}?${suffix}${b}`,
          summary: `Match '${shorter}' or '${longer}' using an optional '${longer[i]}' quantifier.`,
          features
        };
      }
    }
  }

  // Case 2: Same length, differing at 1 character index (e.g., gray vs grey, organize vs organise)
  if (w1.length === w2.length && w1.length > 1) {
    let diffCount = 0;
    let diffIndex = -1;
    for (let i = 0; i < w1.length; i++) {
      if (w1[i] !== w2[i]) {
        diffCount++;
        diffIndex = i;
      }
    }
    if (diffCount === 1 && diffIndex !== -1) {
      const prefix = escapeRegexLiteral(w1.slice(0, diffIndex));
      const c1 = escapeCharClassLiteral(w1[diffIndex]);
      const c2 = escapeCharClassLiteral(w2[diffIndex]);
      const suffix = escapeRegexLiteral(w1.slice(diffIndex + 1));
      features.push(`Character set ([${c1}${c2}])`);
      return {
        pattern: `${b}${prefix}[${c1}${c2}]${suffix}${b}`,
        summary: `Match '${w1}' or '${w2}' using character class [${c1}${c2}].`,
        features
      };
    }
  }

  // Case 3: General alternation
  features.push('Alternation ((?:a|b))');
  return {
    pattern: `${b}(?:${escapeRegexLiteral(w1)}|${escapeRegexLiteral(w2)})${b}`,
    summary: `Match '${w1}' or '${w2}'.`,
    features
  };
}
