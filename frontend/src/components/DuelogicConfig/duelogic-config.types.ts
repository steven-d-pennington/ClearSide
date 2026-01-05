/**
 * Types for Duelogic Configuration Components
 */

export type PhilosophicalFramework =
  | 'utilitarian'
  | 'virtue_ethics'
  | 'deontological'
  | 'pragmatic'
  | 'libertarian'
  | 'communitarian'
  | 'cosmopolitan'
  | 'precautionary'
  | 'autonomy_centered'
  | 'care_ethics';

export type DebateTone = 'academic' | 'respectful' | 'spirited' | 'heated';

export type AccountabilityLevel = 'relaxed' | 'moderate' | 'strict';

export type AggressivenessLevel = 1 | 2 | 3 | 4 | 5;

export interface ChairInfo {
  id: string;
  name: string;
  description: string;
  coreQuestion: string;
  strengthsToAcknowledge: string[];
  blindSpotsToAdmit: string[];
}

export interface ModelInfo {
  id: string;
  displayName: string;
  provider: string;
  capabilities: string[];
  costTier: 'low' | 'medium' | 'high';
}

export interface PresetChairInfo {
  framework: PhilosophicalFramework;
}

export interface PresetInfo {
  id: string;
  name: string;
  description: string;
  chairs: PresetChairInfo[];
}

export interface DuelogicChair {
  position: string;
  framework: PhilosophicalFramework;
  modelId: string;
  modelDisplayName?: string;
  providerName?: string;
  temperatureOverride?: number;
}

export interface DuelogicConfig {
  chairs: DuelogicChair[];
  arbiter?: {
    modelId?: string;
    modelDisplayName?: string;
    accountabilityLevel?: AccountabilityLevel;
    interventionThreshold?: number;
  };
  flow?: {
    style?: 'structured' | 'conversational';
    maxExchanges?: number;
    targetDurationMinutes?: number;
    autoAdvance?: boolean;
  };
  interruptions?: {
    enabled?: boolean;
    allowChairInterruptions?: boolean;
    allowArbiterInterruptions?: boolean;
    aggressiveness?: AggressivenessLevel;
    cooldownSeconds?: number;
  };
  tone?: DebateTone;
  podcastMode?: {
    enabled?: boolean;
    showName?: string;
    episodeNumber?: number;
    includeIntro?: boolean;
    includeOutro?: boolean;
  };
  mandates?: {
    steelManningRequired?: boolean;
    selfCritiqueRequired?: boolean;
    arbiterCanInterject?: boolean;
  };
}

export interface ChairSelectorProps {
  chairs: DuelogicChair[];
  onChairsChange: (chairs: DuelogicChair[]) => void;
  availableChairs: ChairInfo[];
  availableModels: ModelInfo[];
  maxChairs?: number;
  minChairs?: number;
  disabled?: boolean;
}

export interface ModelDropdownProps {
  value: string;
  onChange: (modelId: string, displayName?: string, provider?: string) => void;
  models: ModelInfo[];
  label?: string;
  disabled?: boolean;
}

export interface PresetSelectorProps {
  onPresetSelect: (presetId: string, preset: PresetInfo) => void;
  presets: PresetInfo[];
  disabled?: boolean;
}

export interface ToneSelectorProps {
  value: DebateTone;
  onChange: (tone: DebateTone) => void;
  disabled?: boolean;
}

export interface InterruptionSettingsProps {
  enabled: boolean;
  allowChairInterruptions: boolean;
  aggressiveness: AggressivenessLevel;
  cooldownSeconds: number;
  onEnabledChange: (enabled: boolean) => void;
  onChairInterruptionsChange: (allowed: boolean) => void;
  onAggressivenessChange: (level: AggressivenessLevel) => void;
  onCooldownChange: (seconds: number) => void;
  disabled?: boolean;
}

export interface DuelogicConfigPanelProps {
  onSubmit: (proposition: string, config: DuelogicConfig) => void;
  onDebateCreated?: (debateId: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

// Tone descriptions
export const TONE_INFO: Record<DebateTone, { name: string; description: string }> = {
  academic: {
    name: 'Academic',
    description: 'Formal, measured language with scholarly citations',
  },
  respectful: {
    name: 'Respectful',
    description: 'Polite disagreement, emphasizing common ground',
  },
  spirited: {
    name: 'Spirited',
    description: 'Passionate advocacy while maintaining professionalism',
  },
  heated: {
    name: 'Heated',
    description: 'Intense debate with pointed rebuttals and interruptions',
  },
};

// Aggressiveness descriptions
export const AGGRESSIVENESS_INFO: Record<AggressivenessLevel, { name: string; description: string }> = {
  1: { name: 'Minimal', description: 'Rare interruptions, only for critical moments' },
  2: { name: 'Conservative', description: 'Occasional interruptions when strongly motivated' },
  3: { name: 'Balanced', description: 'Natural interruption frequency' },
  4: { name: 'Assertive', description: 'Frequent engagement and challenges' },
  5: { name: 'Aggressive', description: 'High interruption rate, heated exchanges' },
};

// Accountability descriptions
export const ACCOUNTABILITY_INFO: Record<AccountabilityLevel, { name: string; description: string }> = {
  relaxed: {
    name: 'Relaxed',
    description: 'Light monitoring, infrequent interjections',
  },
  moderate: {
    name: 'Moderate',
    description: 'Balanced enforcement of debate principles',
  },
  strict: {
    name: 'Strict',
    description: 'Close monitoring, interjections for any violation',
  },
};

// Cost tier colors
export const TIER_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-blue-100 text-blue-800',
  high: 'bg-purple-100 text-purple-800',
};
