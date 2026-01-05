/**
 * DuelogicConfig Components
 *
 * Configuration UI for Duelogic debate mode.
 */

export { DuelogicConfigPanel } from './DuelogicConfigPanel';
export { ChairSelector } from './ChairSelector';
export { ChairCard } from './ChairCard';
export { PresetSelector } from './PresetSelector';
export { ToneSelector } from './ToneSelector';
export { InterruptionSettings } from './InterruptionSettings';
export { FlowSettings } from './FlowSettings';

export {
  useDuelogicChairs,
  useDuelogicModels,
  useDuelogicPresets,
  useDuelogicDefaults,
  createDuelogicDebate,
} from './useDuelogicData';

export type {
  DuelogicConfig,
  DuelogicChair,
  ChairInfo,
  ModelInfo,
  PresetInfo,
  DebateTone,
  AggressivenessLevel,
  AccountabilityLevel,
  PhilosophicalFramework,
} from './duelogic-config.types';
