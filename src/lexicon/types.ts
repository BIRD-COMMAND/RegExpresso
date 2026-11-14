export interface LexiconEntry {
  id: string;
  label: string;
  /** Regex matching the normalized phrase when the entire phrase is this entity */
  exactMatcher: RegExp;
  /** Regex matching the entity inside a larger phrase */
  keywordMatcher?: RegExp;
  /** Default pattern when used in a Find slot without explicit quantifier */
  findPattern: string;
  /** Atomic unit pattern to which explicit quantifiers like {3,5} or + attach */
  singleUnitPattern: string;
  /** Characters to place inside [...] or [^...] when combining into a character class */
  charClassChars?: string;
  /** Concrete replacement string when used in a Replace slot */
  replaceLiteral?: string;
  /** Whether multiline flag 'm' should be enabled */
  needsMultiline?: boolean;
  /** Whether word boundaries \b...\b are appropriate when bounded */
  supportsWordBoundary?: boolean;
  /** Features description */
  features: string[];
}

export interface WrapperSpec {
  open: string;
  close: string;
  label: string;
  usesWholeMatch?: boolean;
}

export interface BlockSpec {
  pattern: string;
  open: string;
  close: string;
  negatedInnerChar: string;
  label: string;
  features: string[];
  isDualQuote?: boolean;
}
