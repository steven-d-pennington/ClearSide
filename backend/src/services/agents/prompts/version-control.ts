/**
 * Prompt Version Control System
 *
 * Manages prompt templates with version tracking, comparison, and deprecation.
 */

import type {
  PromptTemplate,
  PromptRegistryEntry,
  VersionDiff,
  AgentType,
  PromptType,
} from './types.js';
import type { DebatePhase } from '../../../types/debate.js';

/**
 * Compares semantic versions
 * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareSemanticVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const n1 = parts1[i] || 0;
    const n2 = parts2[i] || 0;

    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }

  return 0;
}

/**
 * Detects if a version change is breaking based on semantic versioning
 */
function isBreakingChange(v1: string, v2: string): boolean {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  // Major version change is breaking
  const major1 = parts1[0] ?? 0;
  const major2 = parts2[0] ?? 0;
  if (major2 > major1) {
    return true;
  }

  return false;
}

/**
 * Splits text into lines for comparison
 */
function splitIntoLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trim().length > 0);
}

/**
 * Finds unique lines in arr1 that are not in arr2
 */
function findUnique(arr1: string[], arr2: string[]): string[] {
  const set2 = new Set(arr2.map((s) => s.trim()));
  return arr1.filter((line) => !set2.has(line.trim()));
}

/**
 * Detects modified sections by looking for similar but not identical lines
 */
function findModified(arr1: string[], arr2: string[]): Array<{ before: string; after: string }> {
  const modified: Array<{ before: string; after: string }> = [];
  const set1 = new Set(arr1.map((s) => s.trim()));
  const set2 = new Set(arr2.map((s) => s.trim()));

  // Simple heuristic: lines with similar structure but different content
  arr1.forEach((line1) => {
    if (!set2.has(line1.trim())) {
      // Check if there's a similar line in arr2
      const similar = arr2.find((line2) => {
        if (set1.has(line2.trim())) return false;

        // Check if lines share common structure (e.g., same prefix)
        const prefix1 = line1.trim().split(' ')[0] ?? '';
        const prefix2 = line2.trim().split(' ')[0] ?? '';

        return prefix1 === prefix2 && prefix1.length > 3;
      });

      if (similar) {
        modified.push({ before: line1.trim(), after: similar.trim() });
      }
    }
  });

  return modified;
}

/**
 * Manages prompt template versions
 */
export class PromptVersionControl {
  /** Registry of all prompts by ID */
  private registry: Map<string, PromptRegistryEntry> = new Map();

  /** Index by agent -> phase -> type -> prompt ID */
  private index: Map<
    AgentType,
    Map<string, Map<PromptType, Set<string>>>
  > = new Map();

  /**
   * Register a new prompt version
   */
  registerPrompt(prompt: PromptTemplate): void {
    const key = this.createKey(prompt.agent, prompt.phase, prompt.type);

    // Get or create registry entry
    let entry = this.registry.get(key);
    if (!entry) {
      entry = {
        latest: prompt,
        versions: [prompt],
      };
      this.registry.set(key, entry);
    } else {
      // Add version
      entry.versions.push(prompt);

      // Sort versions
      entry.versions.sort((a, b) =>
        compareSemanticVersions(b.version, a.version)
      );

      // Update latest
      if (entry.versions[0]) {
        entry.latest = entry.versions[0];
      }
    }

    // Update index
    this.updateIndex(prompt);
  }

  /**
   * Get the latest version of a prompt
   */
  getLatest(
    agent: AgentType,
    phase?: DebatePhase | string,
    type?: PromptType
  ): PromptTemplate | null {
    const key = this.createKey(agent, phase, type);
    const entry = this.registry.get(key);

    if (!entry || entry.deprecated) {
      return null;
    }

    return entry.latest;
  }

  /**
   * Get a specific version of a prompt
   */
  getVersion(
    agent: AgentType,
    version: string,
    phase?: DebatePhase | string,
    type?: PromptType
  ): PromptTemplate | null {
    const key = this.createKey(agent, phase, type);
    const entry = this.registry.get(key);

    if (!entry) {
      return null;
    }

    const prompt = entry.versions.find((v) => v.version === version);
    return prompt || null;
  }

  /**
   * Get all versions of a prompt
   */
  getAllVersions(
    agent: AgentType,
    phase?: DebatePhase | string,
    type?: PromptType
  ): PromptTemplate[] {
    const key = this.createKey(agent, phase, type);
    const entry = this.registry.get(key);

    if (!entry) {
      return [];
    }

    return [...entry.versions];
  }

  /**
   * Compare two versions
   */
  compareVersions(
    v1: string,
    v2: string,
    agent: AgentType,
    phase?: string,
    type?: PromptType
  ): VersionDiff {
    const prompt1 = this.getVersion(agent, v1, phase, type);
    const prompt2 = this.getVersion(agent, v2, phase, type);

    if (!prompt1 || !prompt2) {
      throw new Error(
        `Cannot compare versions: ${v1} or ${v2} not found for agent ${agent}`
      );
    }

    const lines1 = splitIntoLines(prompt1.template);
    const lines2 = splitIntoLines(prompt2.template);

    const added = findUnique(lines2, lines1);
    const removed = findUnique(lines1, lines2);
    const modified = findModified(lines1, lines2);

    // Check for breaking changes
    let breaking = isBreakingChange(v1, v2);

    // Also check for structural breaking changes
    if (!breaking) {
      // Variable changes
      const vars1 = new Set(prompt1.variables);
      const vars2 = new Set(prompt2.variables);
      const removedVars = [...vars1].filter((v) => !vars2.has(v));

      // Output format changes
      const formatChanged = prompt1.outputFormat !== prompt2.outputFormat;

      if (removedVars.length > 0 || formatChanged) {
        breaking = true;
      }

      // Quality checks changes
      const checks1 = new Set(prompt1.qualityChecks.map((c) => c.name));
      const checks2 = new Set(prompt2.qualityChecks.map((c) => c.name));
      const removedChecks = [...checks1].filter((c) => !checks2.has(c));

      if (removedChecks.length > 0) {
        breaking = true;
      }
    }

    // Generate summary
    const summary = this.generateChangeSummary(
      added.length,
      removed.length,
      modified.length,
      breaking
    );

    return {
      added,
      removed,
      modified,
      breaking,
      summary,
    };
  }

  /**
   * Mark a prompt as deprecated
   */
  deprecate(promptId: string, replacement?: string, reason?: string): void {
    // Find the prompt by ID
    for (const [_key, entry] of this.registry.entries()) {
      const hasPrompt = entry.versions.some((v) => v.id === promptId);

      if (hasPrompt) {
        entry.deprecated = {
          since: new Date().toISOString(),
          replacement,
          reason: reason || 'Deprecated in favor of newer version',
        };
        return;
      }
    }

    throw new Error(`Prompt ${promptId} not found in registry`);
  }

  /**
   * Check if a prompt is deprecated
   */
  isDeprecated(promptId: string): boolean {
    for (const entry of this.registry.values()) {
      const hasPrompt = entry.versions.some((v) => v.id === promptId);
      if (hasPrompt) {
        return !!entry.deprecated;
      }
    }

    return false;
  }

  /**
   * Get deprecation info for a prompt
   */
  getDeprecationInfo(promptId: string): PromptRegistryEntry['deprecated'] | null {
    for (const entry of this.registry.values()) {
      const hasPrompt = entry.versions.some((v) => v.id === promptId);
      if (hasPrompt) {
        return entry.deprecated || null;
      }
    }

    return null;
  }

  /**
   * Get all registry entries
   */
  getAllEntries(): Map<string, PromptRegistryEntry> {
    return new Map(this.registry);
  }

  /**
   * Create a unique key for indexing
   */
  private createKey(
    agent: AgentType,
    phase?: DebatePhase | string,
    type?: PromptType
  ): string {
    const parts: string[] = [agent];

    if (phase) {
      parts.push(phase);
    } else {
      parts.push('*');
    }

    if (type) {
      parts.push(type);
    } else {
      parts.push('*');
    }

    return parts.join(':');
  }

  /**
   * Update the index for fast lookups
   */
  private updateIndex(prompt: PromptTemplate): void {
    const { agent, phase, type } = prompt;

    if (!this.index.has(agent)) {
      this.index.set(agent, new Map());
    }

    const agentIndex = this.index.get(agent)!;
    const phaseKey = phase || '*';

    if (!agentIndex.has(phaseKey)) {
      agentIndex.set(phaseKey, new Map());
    }

    const phaseIndex = agentIndex.get(phaseKey)!;

    if (!phaseIndex.has(type)) {
      phaseIndex.set(type, new Set());
    }

    phaseIndex.get(type)!.add(prompt.id);
  }

  /**
   * Generate a human-readable summary of changes
   */
  private generateChangeSummary(
    added: number,
    removed: number,
    modified: number,
    breaking: boolean
  ): string {
    const parts: string[] = [];

    if (breaking) {
      parts.push('⚠️ BREAKING CHANGE');
    }

    if (added > 0) {
      parts.push(`+${added} additions`);
    }

    if (removed > 0) {
      parts.push(`-${removed} deletions`);
    }

    if (modified > 0) {
      parts.push(`~${modified} modifications`);
    }

    if (parts.length === 0) {
      return 'No changes detected';
    }

    return parts.join(', ');
  }
}

/**
 * Prompt registry for managing all prompts
 */
export class PromptRegistry {
  private versionControl: PromptVersionControl;

  constructor(prompts: PromptTemplate[] = []) {
    this.versionControl = new PromptVersionControl();

    // Register all prompts
    prompts.forEach((prompt) => {
      this.versionControl.registerPrompt(prompt);
    });
  }

  /**
   * Get a prompt by agent, phase, and type
   */
  getPrompt(
    agent: AgentType,
    phase: string,
    type?: PromptType
  ): PromptTemplate | null {
    // Try exact match first
    let prompt = this.versionControl.getLatest(agent, phase, type);

    // If not found and type is specified, try without type
    if (!prompt && type) {
      prompt = this.versionControl.getLatest(agent, phase);
    }

    // If still not found, try with 'all' phase
    if (!prompt) {
      prompt = this.versionControl.getLatest(agent, 'all', type);
    }

    // Last resort: try without phase and type
    if (!prompt) {
      prompt = this.versionControl.getLatest(agent);
    }

    return prompt;
  }

  /**
   * List all prompts, optionally filtered by agent
   */
  listPrompts(agent?: AgentType): PromptTemplate[] {
    const entries = this.versionControl.getAllEntries();
    const prompts: PromptTemplate[] = [];

    for (const entry of entries.values()) {
      if (!agent || entry.latest.agent === agent) {
        prompts.push(entry.latest);
      }
    }

    // Sort by agent, phase, type
    prompts.sort((a, b) => {
      if (a.agent !== b.agent) {
        return a.agent.localeCompare(b.agent);
      }

      const phaseA = a.phase || '';
      const phaseB = b.phase || '';

      if (phaseA !== phaseB) {
        return phaseA.localeCompare(phaseB);
      }

      return a.type.localeCompare(b.type);
    });

    return prompts;
  }

  /**
   * Register a new prompt
   */
  registerPrompt(prompt: PromptTemplate): void {
    this.versionControl.registerPrompt(prompt);
  }

  /**
   * Get the version control instance
   */
  getVersionControl(): PromptVersionControl {
    return this.versionControl;
  }

  /**
   * Get a specific version
   */
  getVersion(
    agent: AgentType,
    version: string,
    phase?: string,
    type?: PromptType
  ): PromptTemplate | null {
    return this.versionControl.getVersion(agent, version, phase, type);
  }

  /**
   * Get all versions
   */
  getAllVersions(
    agent: AgentType,
    phase?: string,
    type?: PromptType
  ): PromptTemplate[] {
    return this.versionControl.getAllVersions(agent, phase, type);
  }

  /**
   * Compare versions
   */
  compareVersions(
    v1: string,
    v2: string,
    agent: AgentType,
    phase?: string,
    type?: PromptType
  ): VersionDiff {
    return this.versionControl.compareVersions(v1, v2, agent, phase, type);
  }

  /**
   * Deprecate a prompt
   */
  deprecate(promptId: string, replacement?: string, reason?: string): void {
    this.versionControl.deprecate(promptId, replacement, reason);
  }

  /**
   * Check if deprecated
   */
  isDeprecated(promptId: string): boolean {
    return this.versionControl.isDeprecated(promptId);
  }

  /**
   * Get deprecation info
   */
  getDeprecationInfo(promptId: string): PromptRegistryEntry['deprecated'] | null {
    return this.versionControl.getDeprecationInfo(promptId);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPrompts: number;
    totalVersions: number;
    deprecatedPrompts: number;
    promptsByAgent: Record<AgentType, number>;
  } {
    const entries = this.versionControl.getAllEntries();
    const promptsByAgent: Record<AgentType, number> = {
      orchestrator: 0,
      pro: 0,
      con: 0,
      moderator: 0,
    };

    let totalVersions = 0;
    let deprecatedPrompts = 0;

    for (const entry of entries.values()) {
      totalVersions += entry.versions.length;
      if (entry.deprecated) {
        deprecatedPrompts++;
      }
      promptsByAgent[entry.latest.agent]++;
    }

    return {
      totalPrompts: entries.size,
      totalVersions,
      deprecatedPrompts,
      promptsByAgent,
    };
  }
}

/**
 * Singleton instance (initialized empty, prompts loaded separately)
 */
export const promptRegistry = new PromptRegistry();

/**
 * Helper to load prompts into the registry
 */
export function loadPromptsIntoRegistry(prompts: PromptTemplate[]): void {
  prompts.forEach((prompt) => {
    promptRegistry.registerPrompt(prompt);
  });
}
