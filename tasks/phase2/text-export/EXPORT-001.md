# EXPORT-001: Markdown Export Generator

**Task ID:** EXPORT-001
**Phase:** Phase 2 - Export Features
**Category:** Text Export
**Priority:** P1 (High - Core Feature)
**Estimated Effort:** 2 days
**Dependencies:** AGENT-001 through AGENT-005 (Debate output structure)
**Status:** TO DO

---

## Overview

Implement Markdown export functionality that converts debate outputs into clean, readable Markdown files. Support customizable formatting, section toggling, and proper syntax highlighting for code blocks.

---

## Objectives

1. **Markdown formatter** for debate outputs
2. **Customizable sections** (include/exclude Pro, Con, Moderator)
3. **Pretty formatting** with proper headings and lists
4. **Metadata inclusion** (timestamp, model, version)
5. **File download** with appropriate naming

---

## Acceptance Criteria

- [ ] Generates valid Markdown from debate JSON
- [ ] Supports section customization
- [ ] Includes metadata header
- [ ] Proper formatting (headings, lists, blockquotes)
- [ ] File downloads with descriptive name
- [ ] Preview before download

---

## Technical Specification

```typescript
// src/services/export/markdownExporter.ts

import { DebateOutput } from '@/types/debate';

export interface MarkdownExportOptions {
  includeProposition?: boolean;
  includePro?: boolean;
  includeCon?: boolean;
  includeModerator?: boolean;
  includeChallenges?: boolean;
  includeMetadata?: boolean;
  format?: 'standard' | 'compact';
}

export class MarkdownExporter {
  export(output: DebateOutput, options: MarkdownExportOptions = {}): string {
    const {
      includeProposition = true,
      includePro = true,
      includeCon = true,
      includeModerator = true,
      includeChallenges = false,
      includeMetadata = true,
    } = options;

    const sections: string[] = [];

    // Metadata
    if (includeMetadata && output.meta) {
      sections.push(this.formatMetadata(output.meta));
    }

    // Proposition
    if (includeProposition && output.proposition) {
      sections.push(this.formatProposition(output.proposition));
    }

    // Pro Arguments
    if (includePro && output.pro) {
      sections.push(this.formatProSection(output.pro));
    }

    // Con Arguments
    if (includeCon && output.con) {
      sections.push(this.formatConSection(output.con));
    }

    // Moderator
    if (includeModerator && output.moderator) {
      sections.push(this.formatModeratorSection(output.moderator));
    }

    // Challenges
    if (includeChallenges && output.challenges && output.challenges.length > 0) {
      sections.push(this.formatChallenges(output.challenges));
    }

    return sections.join('\n\n---\n\n');
  }

  private formatMetadata(meta: any): string {
    return `# Debate Analysis

**Generated:** ${new Date(meta.generated_at).toLocaleString()}
**Model:** ${meta.model}
**Version:** ${meta.version}`;
  }

  private formatProposition(prop: any): string {
    return `## Proposition

**Question:** ${prop.normalized}

${prop.context ? `**Context:** ${prop.context}\n` : ''}`;
  }

  private formatProSection(pro: any): string {
    const parts: string[] = ['## Arguments FOR'];

    if (pro.summary) {
      parts.push(`*${pro.summary}*`);
    }

    pro.arguments.forEach((arg: any, i: number) => {
      parts.push(`### ${i + 1}. ${arg.title}

**Category:** ${arg.category}

${arg.description}

${arg.evidence && arg.evidence.length > 0 ? this.formatEvidence(arg.evidence) : ''}

${arg.assumptions && arg.assumptions.length > 0 ? this.formatAssumptions(arg.assumptions) : ''}`);
    });

    if (pro.uncertainties && pro.uncertainties.length > 0) {
      parts.push('**Key Uncertainties:**');
      parts.push(pro.uncertainties.map((u: string) => `- ${u}`).join('\n'));
    }

    return parts.join('\n\n');
  }

  private formatConSection(con: any): string {
    // Similar to formatProSection
    return this.formatProSection(con).replace('FOR', 'AGAINST');
  }

  private formatModeratorSection(mod: any): string {
    return `## Moderator Synthesis

${mod.summary}

**Agreements:**
${mod.agreements.map((a: string) => `- ${a}`).join('\n')}

**Disagreements:**
${mod.disagreements.map((d: string) => `- ${d}`).join('\n')}

**Key Decision Points:**
${mod.hinges.map((h: string) => `- ${h}`).join('\n')}`;
  }

  private formatEvidence(evidence: any[]): string {
    return `**Evidence:**\n${evidence.map((e) => `- ${e.claim} (${e.type}, confidence: ${e.confidence})`).join('\n')}`;
  }

  private formatAssumptions(assumptions: string[]): string {
    return `**Assumptions:**\n${assumptions.map((a) => `- ${a}`).join('\n')}`;
  }

  private formatChallenges(challenges: any[]): string {
    return `## Challenges\n\n${challenges.map((c, i) => `### Challenge ${i + 1}\n\n${c.userChallenge}\n\n**Response:** ${c.response}`).join('\n\n')}`;
  }

  downloadAsFile(markdown: string, filename: string = 'debate-analysis.md') {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
```

---

## Implementation Steps

1. **Day 1:** Build MarkdownExporter class with formatting methods
2. **Day 2:** Add download functionality, preview component, tests

---

## Validation Steps

- [ ] Valid Markdown generated
- [ ] All sections format correctly
- [ ] Download works
- [ ] Tests pass

---

**Last Updated:** 2025-12-23
