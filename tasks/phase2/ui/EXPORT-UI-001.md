# EXPORT-UI-001: Export Control Panel

**Task ID:** EXPORT-UI-001
**Phase:** Phase 2
**Category:** UI - Export Features
**Priority:** P1
**Estimated Effort:** 3 days
**Dependencies:** EXPORT-001, EXPORT-002, AUDIO-004, VIDEO-004
**Status:** TO DO

---

## Overview

Create export control panel UI that allows users to select export format (Markdown, PDF, Audio, Video), customize options, and initiate export jobs.

---

## Objectives

1. Export format selection (MD, PDF, MP3, MP4)
2. Customization options per format
3. Section toggle (include/exclude Pro, Con, Moderator)
4. Preview before export
5. Export initiation and queue management

---

## Component Structure

```typescript
// src/components/ExportPanel/ExportPanel.tsx

interface ExportPanelProps {
  debateOutput: DebateOutput;
  sessionId: string;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ debateOutput, sessionId }) => {
  const [selectedFormat, setSelectedFormat] = useState<'md' | 'pdf' | 'audio' | 'video'>('md');
  const [options, setOptions] = useState<ExportOptions>({
    includeProposition: true,
    includePro: true,
    includeCon: true,
    includeModerator: true,
  });

  return (
    <div className="export-panel">
      <FormatSelector selected={selectedFormat} onChange={setSelectedFormat} />
      <OptionsForm format={selectedFormat} options={options} onChange={setOptions} />
      <PreviewButton format={selectedFormat} options={options} />
      <ExportButton format={selectedFormat} options={options} sessionId={sessionId} />
    </div>
  );
};
```

---

**Last Updated:** 2025-12-23
