export type IntentMode = 'find' | 'replace' | 'multi-step';

export interface RegexStep {
  description: string;
  find: string;
  replace?: string;
  flags: string;
}

export interface CompiledRegexResult {
  isPossible: true;
  mode: IntentMode;
  summary: string;
  steps: RegexStep[];
  featuresUsed: string[];
  confidence: 'high' | 'medium' | 'low';
  preferredAction?: ExecutionAction;
}

export interface ImpossibleWorkaround {
  label: string;
  description: string;
  actionType: 'vscode-command' | 'custom-script' | 'sort-then-regex';
  commandId?: string;
  followUpStep?: RegexStep;
}

export interface ImpossibleRegexResult {
  isPossible: false;
  category:
    | 'State Tracking & Dynamic Arithmetic'
    | 'Arbitrary Recursive Nesting (Context-Free Grammar)'
    | 'Global Unordered Deduplication & Sorting'
    | 'Semantic, Temporal, or String Reversal Logic';
  reason: string;
  advice: string;
  workaround?: ImpossibleWorkaround;
}

export type ParseOutcome = CompiledRegexResult | ImpossibleRegexResult;

export type ExecutionAction =
  | 'replace-all'
  | 'select-matches'
  | 'carets-at-start'
  | 'carets-at-end'
  | 'select-group-1'
  | 'extract-to-new-file'
  | 'copy-matches'
  | 'open-in-native-find'
  | 'run-workaround';

export type MacroIntentType =
  | 'FIND'
  | 'DELETE'
  | 'REPLACE'
  | 'WRAP'
  | 'INSERT_ADD'
  | 'ENSURE'
  | 'TRIM'
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

export type InsertPosition =
  | 'start-of-line'
  | 'end-of-line'
  | 'before-target'
  | 'after-target';

export type LocationHint =
  | 'start-of-line'
  | 'end-of-line'
  | 'middle-of-word'
  | 'whole-word'
  | 'whole-line';

export interface ParsedQuery {
  raw: string;
  intent: MacroIntentType;
  targetClause: string;
  replacementClause?: string;
  insertPosition?: InsertPosition;
  missingCheck?: boolean;
  caseTargetMode?: CaseTransformMode;
  conditions: LookaroundCondition[];
  exclusionClause?: string;
  locationHint?: LocationHint;
  nonGreedyHint?: boolean;
  flags: {
    caseInsensitive: boolean;
    multiline: boolean;
  };
  preferredAction?: ExecutionAction;
  quotes: string[];
}

export interface TargetResolutionContext {
  hasCurrencyLookbehind?: boolean;
  locationHint?: string;
  isDeleteLineContext?: boolean;
}

export interface ResolvedTarget {
  pattern: string;
  label: string;
  features: string[];
  needsMultiline: boolean;
  needsCaseInsensitive: boolean;
  defaultReplace?: string;
  lexiconId?: string;
  isWholeLine?: boolean;
  hasCaptureGroups?: boolean;
}
