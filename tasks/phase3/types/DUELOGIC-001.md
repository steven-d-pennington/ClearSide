# DUELOGIC-001: Types & Configuration System

**Priority:** P0
**Estimate:** S (1 day)
**Labels:** `types`, `backend`, `duelogic`
**Status:** ✅ DONE

---

## Context

Duelogic is a new debate mode featuring philosophical "Chairs," mandatory steel-manning, self-critique requirements, and an Arbiter who enforces intellectual honesty. This task creates the foundational TypeScript types and configuration system.

**References:**
- [Master Duelogic Spec](../../DUELOGIC-001.md) - Full specification
- [Existing Types](../../../backend/src/types/) - Current type patterns

---

## Requirements

### Acceptance Criteria

- [ ] Create `backend/src/types/duelogic.ts` with all core types
- [ ] Define `PhilosophicalChair` union type (10 philosophical frameworks)
- [ ] Define `DuelogicChair` interface for chair participants
- [ ] Define `DuelogicConfig` interface for full debate configuration
- [ ] Define `ResponseEvaluation` interface for adherence tracking
- [ ] Define `ChairInterruptCandidate` and `ChairInterruptReason` types
- [ ] Create `PHILOSOPHICAL_CHAIR_INFO` constant with framework metadata
- [ ] Create `DUELOGIC_DEFAULTS` configuration constant
- [ ] Create `DUELOGIC_PRESETS` for preset matchups
- [ ] Create `DUELOGIC_CONSTRAINTS` for validation limits
- [ ] Export all types for use across codebase
- [ ] Add types to the main types barrel export

---

## Implementation Guide

### File: `backend/src/types/duelogic.ts`

```typescript
/**
 * Duelogic Debate Mode Types
 *
 * Philosophical debate format with:
 * - Multiple chairs (2-6) representing philosophical frameworks
 * - An Arbiter enforcing steel-manning and self-critique
 * - Podcast-style intro/outro for production quality
 */

/**
 * Philosophical frameworks that can be assigned as "Chairs"
 */
export type PhilosophicalChair =
  | 'utilitarian'        // Maximize aggregate welfare
  | 'virtue_ethics'      // Character and human flourishing
  | 'deontological'      // Duty-based, rule-following
  | 'pragmatic'          // Practical consequences, what works
  | 'libertarian'        // Individual liberty, minimal intervention
  | 'communitarian'      // Community bonds, social obligations
  | 'cosmopolitan'       // Universal human rights, global perspective
  | 'precautionary'      // Caution, risk-aversion
  | 'autonomy_centered'  // Self-determination, agency
  | 'care_ethics';       // Relationships, vulnerability, care

/**
 * A Chair participant in a Duelogic debate
 */
export interface DuelogicChair {
  /** Unique position identifier */
  position: string; // 'chair_1', 'chair_2', etc.

  /** Assigned philosophical framework */
  framework: PhilosophicalChair;

  /** LLM model ID */
  modelId: string;

  /** Display name for the model (e.g., "Grok 4.1 Flash") */
  modelDisplayName?: string;

  /** Provider name (e.g., "xAI", "Anthropic", "OpenAI") */
  providerName?: string;

  /** Optional custom persona overlay */
  persona?: string;
}

/**
 * Accountability level for arbiter
 */
export type AccountabilityLevel =
  | 'relaxed'    // Only synthesizes at end
  | 'moderate'   // Interjects on major violations
  | 'strict';    // Evaluates every response, calls out all violations

/**
 * Full Duelogic configuration - supports 2-6 chairs
 */
export interface DuelogicConfig {
  mode: 'duelogic';

  /** 2-6 chairs participating in the debate */
  chairs: DuelogicChair[];

  /** Arbiter configuration */
  arbiter: {
    modelId: string;
    modelDisplayName?: string;
    accountabilityLevel: AccountabilityLevel;
  };

  /** Flow and pacing */
  flow: {
    style: 'structured' | 'conversational';
    maxExchanges: number;
    targetDurationMinutes: number;
  };

  /** Interruption settings */
  interruptions: {
    enabled: boolean;
    /** Who can interrupt */
    allowChairInterruptions: boolean;
    allowArbiterInterruptions: boolean;
    /** 1=polite, 5=aggressive */
    aggressiveness: 1 | 2 | 3 | 4 | 5;
    /** Cooldown between interrupts per chair (seconds) */
    cooldownSeconds: number;
  };

  /** Tone settings */
  tone: 'respectful' | 'spirited' | 'heated';

  /** Podcast production mode */
  podcastMode: {
    enabled: boolean;
    showName: string;  // "Duelogic" by default
    episodeNumber?: number;
    includeCallToAction: boolean;
  };

  /** Accountability mandates */
  mandates: {
    requireSteelManning: boolean;
    requireSelfCritique: boolean;
    arbiterCanInterject: boolean;
  };
}

/**
 * Constraints
 */
export const DUELOGIC_CONSTRAINTS = {
  minChairs: 2,
  maxChairs: 6,
  minExchanges: 3,
  maxExchanges: 30,
} as const;

/**
 * Evaluation of a chair's response for adherence to principles
 */
export interface ResponseEvaluation {
  /** Overall adherence score (0-100) */
  adherenceScore: number;

  /** Did they steel-man before critiquing? */
  steelManning: {
    attempted: boolean;
    quality: 'strong' | 'adequate' | 'weak' | 'absent';
    notes?: string;
  };

  /** Did they acknowledge their framework's weaknesses? */
  selfCritique: {
    attempted: boolean;
    quality: 'strong' | 'adequate' | 'weak' | 'absent';
    notes?: string;
  };

  /** Were they consistent with their assigned framework? */
  frameworkConsistency: {
    consistent: boolean;
    violations?: string[];
  };

  /** Any intellectual honesty issues? */
  intellectualHonesty: {
    score: 'high' | 'medium' | 'low';
    issues?: string[];
  };

  /** Should the arbiter interject? */
  requiresInterjection: boolean;
  interjectionReason?: string;
}

/**
 * Candidate for a chair interruption
 */
export interface ChairInterruptCandidate {
  /** The chair that wants to interrupt */
  interruptingChair: DuelogicChair;

  /** The chair being interrupted */
  interruptedChair: DuelogicChair;

  /** Why they want to interrupt */
  triggerReason: ChairInterruptReason;

  /** What triggered it (phrase or concept) */
  triggerContent: string;

  /** Urgency score 0-1 */
  urgency: number;

  /** Suggested interjection opener */
  suggestedOpener?: string;
}

export type ChairInterruptReason =
  | 'factual_correction'     // "That's not actually what utilitarianism claims..."
  | 'straw_man_detected'     // "Hold on, you're misrepresenting my position..."
  | 'direct_challenge'       // "I have to push back on that..."
  | 'clarification_needed'   // "Wait, can you clarify what you mean by..."
  | 'strong_agreement'       // "Yes! And let me build on that..."
  | 'pivotal_point';         // "This is exactly the crux of our disagreement..."

/**
 * Philosophical chair info with descriptions and blind spots
 */
export interface PhilosophicalChairInfo {
  name: string;
  description: string;
  coreQuestion: string;
  strengthsToAcknowledge: string[];
  blindSpotsToAdmit: string[];
}

export const PHILOSOPHICAL_CHAIR_INFO: Record<PhilosophicalChair, PhilosophicalChairInfo> = {
  utilitarian: {
    name: 'Utilitarian Chair',
    description: 'Argues from maximizing aggregate welfare and outcomes',
    coreQuestion: 'What produces the greatest good for the greatest number?',
    strengthsToAcknowledge: [
      'Forces calculation of real-world consequences',
      'Egalitarian - each person counts equally',
      'Provides measurable decision framework'
    ],
    blindSpotsToAdmit: [
      'Can justify sacrificing minorities for majority benefit',
      'Difficult to measure and compare utilities',
      'May ignore rights and justice concerns'
    ]
  },
  virtue_ethics: {
    name: 'Virtue Ethics Chair',
    description: 'Argues from character, wisdom, and human flourishing',
    coreQuestion: 'What would a person of good character do?',
    strengthsToAcknowledge: [
      'Centers human development and excellence',
      'Recognizes moral complexity requiring judgment',
      'Integrates emotion and reason'
    ],
    blindSpotsToAdmit: [
      'Virtues can be culturally relative',
      'Offers less guidance for novel dilemmas',
      'May prioritize individual flourishing over collective welfare'
    ]
  },
  deontological: {
    name: 'Deontological Chair',
    description: 'Argues from duty, rules, and moral obligations',
    coreQuestion: 'What does moral duty require, regardless of consequences?',
    strengthsToAcknowledge: [
      'Provides clear moral boundaries',
      'Protects individual rights absolutely',
      'Offers consistency and predictability'
    ],
    blindSpotsToAdmit: [
      'Can be inflexible in complex situations',
      'May lead to worse outcomes by ignoring consequences',
      'Rules can conflict with each other'
    ]
  },
  pragmatic: {
    name: 'Pragmatic Chair',
    description: 'Argues from what works in practice and real-world feasibility',
    coreQuestion: 'What approach will actually work in the real world?',
    strengthsToAcknowledge: [
      'Grounded in practical reality',
      'Flexible and adaptive to circumstances',
      'Focuses on achievable outcomes'
    ],
    blindSpotsToAdmit: [
      'May sacrifice principle for expediency',
      'Short-term thinking can miss long-term consequences',
      '"What works" can be defined by those in power'
    ]
  },
  libertarian: {
    name: 'Libertarian Chair',
    description: 'Argues from individual liberty and minimal coercion',
    coreQuestion: 'Does this respect individual freedom and consent?',
    strengthsToAcknowledge: [
      'Protects individual autonomy',
      'Skeptical of concentrated power',
      'Values voluntary cooperation'
    ],
    blindSpotsToAdmit: [
      'May ignore structural inequalities',
      'Underweights positive obligations to help others',
      'Assumes level playing field that may not exist'
    ]
  },
  communitarian: {
    name: 'Communitarian Chair',
    description: 'Argues from community bonds, social obligations, and shared values',
    coreQuestion: 'What do we owe to our communities and what do they owe us?',
    strengthsToAcknowledge: [
      'Recognizes humans as social beings',
      'Values tradition and social cohesion',
      'Emphasizes mutual obligations'
    ],
    blindSpotsToAdmit: [
      'Can suppress individual dissent',
      'May privilege in-group over outsiders',
      'Traditions can encode past injustices'
    ]
  },
  cosmopolitan: {
    name: 'Cosmopolitan Chair',
    description: 'Argues from universal human rights and global perspective',
    coreQuestion: 'What do we owe to all humans, regardless of nationality?',
    strengthsToAcknowledge: [
      'Recognizes universal human dignity',
      'Challenges arbitrary borders and boundaries',
      'Promotes global cooperation'
    ],
    blindSpotsToAdmit: [
      'May be culturally imperialistic',
      'Underweights local knowledge and context',
      'Can seem abstract and detached from lived reality'
    ]
  },
  precautionary: {
    name: 'Precautionary Chair',
    description: 'Argues from caution, risk-aversion, and avoiding irreversible harm',
    coreQuestion: 'What are the risks of getting this wrong, and can we afford them?',
    strengthsToAcknowledge: [
      'Takes catastrophic risks seriously',
      'Protects against irreversible harm',
      'Acknowledges uncertainty honestly'
    ],
    blindSpotsToAdmit: [
      'Can paralyze decision-making',
      'May ignore the risks of inaction',
      'Can be used to block any change'
    ]
  },
  autonomy_centered: {
    name: 'Autonomy-Centered Chair',
    description: 'Argues from self-determination and personal agency',
    coreQuestion: 'Does this respect people\'s right to make their own choices?',
    strengthsToAcknowledge: [
      'Respects individual self-determination',
      'Protects against paternalism',
      'Values informed consent'
    ],
    blindSpotsToAdmit: [
      'May ignore how choices are shaped by circumstances',
      'Underweights relational aspects of selfhood',
      'Assumes capacity for autonomous choice exists'
    ]
  },
  care_ethics: {
    name: 'Care Ethics Chair',
    description: 'Argues from relationships, vulnerability, and caring obligations',
    coreQuestion: 'How do we best care for those who depend on us?',
    strengthsToAcknowledge: [
      'Centers human relationships and connection',
      'Attends to vulnerability and dependency',
      'Values emotional responsiveness'
    ],
    blindSpotsToAdmit: [
      'May privilege close relationships over strangers',
      'Can reinforce gendered care expectations',
      'Less guidance for impersonal policy decisions'
    ]
  },
};

/**
 * Default Duelogic configuration
 */
export const DUELOGIC_DEFAULTS: DuelogicConfig = {
  mode: 'duelogic',
  chairs: [
    {
      position: 'chair_1',
      framework: 'utilitarian',
      modelId: 'anthropic/claude-sonnet-4',
      modelDisplayName: 'Claude Sonnet 4',
      providerName: 'Anthropic',
    },
    {
      position: 'chair_2',
      framework: 'virtue_ethics',
      modelId: 'x-ai/grok-3',
      modelDisplayName: 'Grok 3',
      providerName: 'xAI',
    },
  ],
  arbiter: {
    modelId: 'openai/gpt-4o',
    modelDisplayName: 'GPT-4o',
    accountabilityLevel: 'moderate',
  },
  flow: {
    style: 'conversational',
    maxExchanges: 8,
    targetDurationMinutes: 45,
  },
  interruptions: {
    enabled: true,
    allowChairInterruptions: true,
    allowArbiterInterruptions: true,
    aggressiveness: 3,
    cooldownSeconds: 60,
  },
  tone: 'spirited',
  podcastMode: {
    enabled: true,
    showName: 'Duelogic',
    includeCallToAction: true,
  },
  mandates: {
    requireSteelManning: true,
    requireSelfCritique: true,
    arbiterCanInterject: true,
  },
};

/**
 * Preset matchups for common debate configurations
 */
export const DUELOGIC_PRESETS = {
  classic_clash: {
    name: 'Classic Clash',
    description: 'Utilitarian vs Virtue Ethics - the foundational philosophical battle',
    chairs: [
      { framework: 'utilitarian' as const },
      { framework: 'virtue_ethics' as const },
    ],
  },

  liberty_vs_community: {
    name: 'Liberty vs Community',
    description: 'Individual rights against collective obligations',
    chairs: [
      { framework: 'libertarian' as const },
      { framework: 'communitarian' as const },
    ],
  },

  three_way_ethics: {
    name: 'Three-Way Ethics Showdown',
    description: 'Consequences vs Character vs Duty',
    chairs: [
      { framework: 'utilitarian' as const },
      { framework: 'virtue_ethics' as const },
      { framework: 'deontological' as const },
    ],
  },

  global_vs_local: {
    name: 'Global vs Local',
    description: 'Universal human rights vs bounded community obligations',
    chairs: [
      { framework: 'cosmopolitan' as const },
      { framework: 'communitarian' as const },
    ],
  },

  caution_vs_progress: {
    name: 'Caution vs Progress',
    description: 'Risk-averse precaution vs bold pragmatism',
    chairs: [
      { framework: 'precautionary' as const },
      { framework: 'pragmatic' as const },
    ],
  },

  battle_royale: {
    name: 'Battle Royale (4-way)',
    description: 'Four frameworks clash: Utilitarian, Virtue, Libertarian, Pragmatic',
    chairs: [
      { framework: 'utilitarian' as const },
      { framework: 'virtue_ethics' as const },
      { framework: 'libertarian' as const },
      { framework: 'pragmatic' as const },
    ],
  },
} as const;

/**
 * Duelogic segment types for debate phases
 */
export type DuelogicSegment =
  | 'introduction'    // Arbiter introduces topic and Chair assignments
  | 'opening'         // Each Chair presents initial position (no interrupts)
  | 'exchange'        // Back-and-forth discussion (with interrupts if enabled)
  | 'synthesis';      // Arbiter synthesizes and closes

/**
 * Interrupt opener templates by reason
 */
export const INTERRUPT_OPENERS: Record<ChairInterruptReason, string[]> = {
  factual_correction: [
    "Actually, that's a mischaracterization—",
    "I need to correct something there—",
    "That's not quite what my framework holds—",
    "Wait, that's not accurate—",
  ],
  straw_man_detected: [
    "Hold on, you're attacking a position I never took—",
    "Wait, that's not the strongest version of my argument—",
    "Let me stop you there—I wouldn't actually claim that—",
    "You're not engaging with my actual position—",
  ],
  direct_challenge: [
    "I have to push back on that—",
    "That's exactly where we disagree—",
    "I can't let that go unchallenged—",
    "No, and here's why—",
  ],
  clarification_needed: [
    "Can you clarify what you mean by—",
    "I'm not sure I follow—are you saying—",
    "Wait, help me understand—",
    "What exactly do you mean when you say—",
  ],
  strong_agreement: [
    "Yes, and this is crucial—",
    "Exactly right, and let me build on that—",
    "This is the key insight—",
    "You've hit on something important—",
  ],
  pivotal_point: [
    "And this is exactly our core disagreement—",
    "This is where the real tension lies—",
    "Let's not gloss over this—this is the crux—",
    "Here's where our frameworks truly clash—",
  ],
};
```

---

## Dependencies

None - this is a foundational task.

---

## Validation

```bash
# TypeScript compilation check
cd backend && npx tsc --noEmit

# Import test
node -e "require('./dist/types/duelogic.js')"
```

---

## Definition of Done

- [ ] All types compile without errors
- [ ] Types match the master specification
- [ ] Constants are correctly defined
- [ ] Types are exported from barrel file
- [ ] No circular dependencies introduced
