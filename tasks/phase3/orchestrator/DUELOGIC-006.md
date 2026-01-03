# DUELOGIC-006: Chair Interruption Engine

**Priority:** P1
**Estimate:** M (2 days)
**Labels:** `orchestrator`, `backend`, `duelogic`
**Status:** 🟢 TO DO
**Depends On:** DUELOGIC-001, DUELOGIC-004

---

## Context

The Chair Interruption Engine enables chairs to interrupt each other during debates for pivotal moments like factual corrections, straw-man detection, or direct challenges. This creates more dynamic, natural debates.

**References:**
- [Master Duelogic Spec](../../DUELOGIC-001.md) - Chair Interruption System section
- [Lively Orchestrator](../../../backend/src/services/debate/lively-orchestrator.ts) - Existing interruption patterns

---

## Requirements

### Acceptance Criteria

- [ ] Create `backend/src/services/debate/chair-interruption-engine.ts`
- [ ] Evaluate when a chair should interrupt
- [ ] Support 6 interrupt reasons (factual correction, straw-man, etc.)
- [ ] Implement urgency scoring
- [ ] Enforce cooldown periods between interrupts
- [ ] Respect aggressiveness settings (1-5)
- [ ] Generate natural interrupt openers
- [ ] Log interruptions to database
- [ ] Write unit tests

---

## Implementation Guide

### File: `backend/src/services/debate/chair-interruption-engine.ts`

```typescript
import { LLMClient } from '../../llm/openrouter-adapter';
import {
  DuelogicChair,
  DuelogicConfig,
  ChairInterruptCandidate,
  ChairInterruptReason,
  PHILOSOPHICAL_CHAIR_INFO,
  INTERRUPT_OPENERS
} from '../../types/duelogic';
import { DuelogicRepository } from '../../db/repositories/duelogic-repository';

interface InterruptEvaluationContext {
  currentSpeaker: DuelogicChair;
  otherChairs: DuelogicChair[];
  recentContent: string;
  debateSoFar: string;
  topic: string;
}

export class ChairInterruptionEngine {
  private llmClient: LLMClient;
  private config: DuelogicConfig;
  private debateId: string;
  private repository: DuelogicRepository;
  private lastInterruptTime: Map<string, number>;

  constructor(
    llmClient: LLMClient,
    config: DuelogicConfig,
    debateId: string,
    repository: DuelogicRepository
  ) {
    this.llmClient = llmClient;
    this.config = config;
    this.debateId = debateId;
    this.repository = repository;
    this.lastInterruptTime = new Map();
  }

  /**
   * Check if any chair should interrupt the current speaker
   */
  async evaluateInterrupt(
    context: InterruptEvaluationContext
  ): Promise<ChairInterruptCandidate | null> {
    if (!this.config.interruptions.enabled) {
      return null;
    }

    if (!this.config.interruptions.allowChairInterruptions) {
      return null;
    }

    // Filter out chairs on cooldown
    const eligibleChairs = context.otherChairs.filter(
      chair => this.canInterrupt(chair.position)
    );

    if (eligibleChairs.length === 0) {
      return null;
    }

    const urgencyThreshold = this.getUrgencyThreshold();

    const prompt = this.buildEvaluationPrompt(context, eligibleChairs);

    const response = await this.llmClient.generate({
      model: this.config.arbiter.modelId,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 300,
    });

    try {
      const parsed = JSON.parse(response.content);

      if (!parsed.shouldInterrupt || parsed.urgency < urgencyThreshold) {
        return null;
      }

      const interruptingChair = eligibleChairs.find(
        c => c.position === parsed.interruptingChairPosition
      );

      if (!interruptingChair) {
        return null;
      }

      const candidate: ChairInterruptCandidate = {
        interruptingChair,
        interruptedChair: context.currentSpeaker,
        triggerReason: parsed.reason,
        triggerContent: parsed.triggerContent,
        urgency: parsed.urgency,
        suggestedOpener: parsed.suggestedOpener || this.getRandomOpener(parsed.reason),
      };

      // Record the interrupt
      await this.recordInterrupt(candidate);

      return candidate;
    } catch (error) {
      console.error('Failed to parse interrupt evaluation:', error);
      return null;
    }
  }

  private buildEvaluationPrompt(
    context: InterruptEvaluationContext,
    eligibleChairs: DuelogicChair[]
  ): string {
    const speakerInfo = PHILOSOPHICAL_CHAIR_INFO[context.currentSpeaker.framework];

    return `You are evaluating whether any chair should interrupt the current speaker.

**Current Speaker:**
${context.currentSpeaker.modelDisplayName || context.currentSpeaker.modelId}
Framework: ${speakerInfo.name}

**What They Just Said:**
"${context.recentContent}"

**Chairs Who Could Interrupt:**
${eligibleChairs.map(c => {
  const info = PHILOSOPHICAL_CHAIR_INFO[c.framework];
  return `- ${c.position}: ${c.modelDisplayName || c.modelId} (${info.name})`;
}).join('\n')}

**Topic:** ${context.topic}

**Recent Debate Context:**
${context.debateSoFar.slice(-800)}

---

**VALID INTERRUPT REASONS:**

1. **factual_correction** - Speaker made a factual error about a framework
   Example: "That's not what utilitarianism actually claims..."

2. **straw_man_detected** - Speaker is attacking a weakened version of a position
   Example: "You're misrepresenting my framework..."

3. **direct_challenge** - A point demands immediate pushback
   Example: "I have to push back on that..."

4. **clarification_needed** - Something crucial is unclear
   Example: "Wait, what do you mean by..."

5. **strong_agreement** - A point is so good it deserves amplification
   Example: "Yes! This is exactly right..."

6. **pivotal_point** - The core disagreement is being crystallized
   Example: "This is exactly our central disagreement..."

---

**EVALUATION CRITERIA:**

- Only recommend interrupting for GENUINELY SIGNIFICANT moments
- Consider the aggressiveness setting: ${this.config.interruptions.aggressiveness}/5
  ${this.config.interruptions.aggressiveness <= 2 ? '(Conservative - only interrupt for major issues)' :
    this.config.interruptions.aggressiveness >= 4 ? '(Aggressive - interrupt frequently)' :
    '(Moderate - interrupt for meaningful moments)'}

**OUTPUT (JSON):**
{
  "shouldInterrupt": boolean,
  "interruptingChairPosition": "chair_1" | "chair_2" | etc | null,
  "reason": "factual_correction" | "straw_man_detected" | "direct_challenge" | "clarification_needed" | "strong_agreement" | "pivotal_point",
  "triggerContent": "the specific phrase that triggered this",
  "urgency": 0.0-1.0,
  "suggestedOpener": "how the interruption should start (2-8 words)"
}

Evaluate now:`;
  }

  private getUrgencyThreshold(): number {
    const thresholds: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0.9,  // Very polite - only major issues
      2: 0.8,
      3: 0.7,  // Moderate
      4: 0.6,
      5: 0.5,  // Aggressive - frequent interrupts
    };
    return thresholds[this.config.interruptions.aggressiveness];
  }

  private canInterrupt(chairPosition: string): boolean {
    const lastTime = this.lastInterruptTime.get(chairPosition);
    if (!lastTime) return true;

    const cooldownMs = this.config.interruptions.cooldownSeconds * 1000;
    return Date.now() - lastTime >= cooldownMs;
  }

  private async recordInterrupt(candidate: ChairInterruptCandidate): Promise<void> {
    // Update cooldown tracking
    this.lastInterruptTime.set(candidate.interruptingChair.position, Date.now());

    // Save to database
    await this.repository.saveChairInterruption(
      this.debateId,
      candidate,
      Date.now()
    );
  }

  private getRandomOpener(reason: ChairInterruptReason): string {
    const openers = INTERRUPT_OPENERS[reason];
    return openers[Math.floor(Math.random() * openers.length)];
  }

  /**
   * Get interrupt statistics for the debate
   */
  async getInterruptStats(): Promise<{
    totalInterrupts: number;
    byChair: Map<string, number>;
    byReason: Map<ChairInterruptReason, number>;
  }> {
    const interrupts = await this.repository.getInterruptionsByDebate(this.debateId);

    const byChair = new Map<string, number>();
    const byReason = new Map<ChairInterruptReason, number>();

    for (const interrupt of interrupts) {
      byChair.set(
        interrupt.interrupting_chair,
        (byChair.get(interrupt.interrupting_chair) || 0) + 1
      );
      byReason.set(
        interrupt.trigger_reason as ChairInterruptReason,
        (byReason.get(interrupt.trigger_reason as ChairInterruptReason) || 0) + 1
      );
    }

    return {
      totalInterrupts: interrupts.length,
      byChair,
      byReason,
    };
  }

  /**
   * Reset cooldowns (useful for testing or new debate segments)
   */
  resetCooldowns(): void {
    this.lastInterruptTime.clear();
  }

  /**
   * Quick heuristic check for potential interrupt triggers
   * Use before full LLM evaluation for efficiency
   */
  quickInterruptCheck(content: string): {
    potentialTrigger: boolean;
    likelyReason?: ChairInterruptReason;
  } {
    const patterns: Array<{ pattern: RegExp; reason: ChairInterruptReason }> = [
      // Straw man indicators
      { pattern: /they (just|only|simply) want/i, reason: 'straw_man_detected' },
      { pattern: /that's (ridiculous|absurd|naive)/i, reason: 'straw_man_detected' },

      // Factual errors about frameworks
      { pattern: /utilitarians? (don't|never) care about/i, reason: 'factual_correction' },
      { pattern: /virtue ethics (ignores?|has no)/i, reason: 'factual_correction' },

      // Pivotal claims
      { pattern: /the (real|fundamental|core) (issue|question|problem) is/i, reason: 'pivotal_point' },
      { pattern: /this is (exactly|precisely) (where|why)/i, reason: 'pivotal_point' },

      // Strong claims warranting challenge
      { pattern: /(obviously|clearly|undeniably|certainly) (wrong|false|mistaken)/i, reason: 'direct_challenge' },
    ];

    for (const { pattern, reason } of patterns) {
      if (pattern.test(content)) {
        return { potentialTrigger: true, likelyReason: reason };
      }
    }

    return { potentialTrigger: false };
  }
}
```

---

## Dependencies

- DUELOGIC-001: Types & Configuration
- DUELOGIC-002: Database Schema (for interrupt logging)
- DUELOGIC-004: Chair Agent (for interrupt responses)

---

## Validation

```bash
# Unit tests
npm run test -- --grep "ChairInterruptionEngine"

# Integration test with debates
npm run test:integration -- --grep "interruptions"
```

---

## Test Cases

```typescript
describe('ChairInterruptionEngine', () => {
  describe('interrupt evaluation', () => {
    it('detects straw-manning worthy of interrupt', async () => {
      const candidate = await engine.evaluateInterrupt({
        currentSpeaker: utilChair,
        otherChairs: [virtueChair],
        recentContent: 'Virtue ethics people just want to feel good about themselves!',
        debateSoFar: '',
        topic: 'AI Ethics',
      });

      expect(candidate).not.toBeNull();
      expect(candidate!.triggerReason).toBe('straw_man_detected');
    });

    it('respects cooldown periods', async () => {
      // First interrupt allowed
      const first = await engine.evaluateInterrupt(mockContext);
      expect(first).not.toBeNull();

      // Immediate second interrupt blocked
      const second = await engine.evaluateInterrupt(mockContext);
      expect(second).toBeNull();
    });

    it('respects aggressiveness setting', async () => {
      // Conservative setting (1)
      const conservativeEngine = new ChairInterruptionEngine(
        llm, { ...config, interruptions: { ...config.interruptions, aggressiveness: 1 } }, 'test', repo
      );

      // Should have higher threshold
      const result = await conservativeEngine.evaluateInterrupt(mildlyInterruptableContext);
      expect(result).toBeNull();
    });
  });

  describe('quick heuristics', () => {
    it('detects straw-man patterns', () => {
      const result = engine.quickInterruptCheck('They just want to ignore consequences!');
      expect(result.potentialTrigger).toBe(true);
      expect(result.likelyReason).toBe('straw_man_detected');
    });

    it('detects pivotal point patterns', () => {
      const result = engine.quickInterruptCheck('The fundamental issue is whether rights are absolute.');
      expect(result.potentialTrigger).toBe(true);
      expect(result.likelyReason).toBe('pivotal_point');
    });
  });

  describe('cooldown management', () => {
    it('tracks cooldowns per chair', () => {
      expect(engine.canInterrupt('chair_1')).toBe(true);
      engine.recordInterrupt(mockCandidate);
      expect(engine.canInterrupt('chair_1')).toBe(false);
    });

    it('resets cooldowns', () => {
      engine.recordInterrupt(mockCandidate);
      engine.resetCooldowns();
      expect(engine.canInterrupt('chair_1')).toBe(true);
    });
  });
});
```

---

## Definition of Done

- [ ] Interruptions trigger for appropriate moments
- [ ] 6 interrupt reason types work correctly
- [ ] Cooldown periods enforced
- [ ] Aggressiveness settings affect threshold
- [ ] Openers sound natural
- [ ] Interruptions logged to database
- [ ] Quick heuristics improve efficiency
- [ ] Unit tests pass with >80% coverage
