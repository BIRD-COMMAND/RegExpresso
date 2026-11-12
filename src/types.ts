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