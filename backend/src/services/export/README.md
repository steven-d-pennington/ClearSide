# Export Services

This directory contains services for exporting debate transcripts to various formats.

## Overview

The export services convert debate transcripts from the database into user-friendly formats for download, sharing, and archival purposes.

## Supported Formats

### ✅ Implemented

- **Markdown** (`markdownExporter.ts`) - Plain text format with rich formatting

### 🚧 Planned (Phase 2)

- **PDF** - Professional document format with styling
- **Audio** - Podcast-style audio narration
- **Video** - Animated video with text and visuals

## Usage

### Markdown Export

```typescript
import { createMarkdownExporter } from './services/export/markdownExporter.js';
import { createTranscriptRecorder } from './services/transcript/transcript-recorder.js';

const exporter = createMarkdownExporter();
const transcriptRecorder = createTranscriptRecorder(schemaValidator);

// Load transcript from database
const transcript = await transcriptRecorder.loadTranscript(debateId);

// Export to Markdown with default options
const result = exporter.export(transcript);

if (result.success) {
  console.log(result.content); // Markdown string
  console.log(result.metadata.fileName); // Suggested filename
} else {
  console.error(result.error);
}
```

### Customizing Export Options

```typescript
import type { MarkdownExportOptions } from './services/export/types.js';

const options: MarkdownExportOptions = {
  includeMetadata: true,        // Include header with debate info
  includeProposition: true,     // Include the debate question
  includePro: true,             // Include Pro advocate arguments
  includeCon: true,             // Include Con advocate arguments
  includeModerator: true,       // Include moderator synthesis
  includeChallenges: true,      // Include user interventions
  includeTranscript: false,     // Include full chronological transcript
  format: 'standard',           // 'standard' or 'compact'
};

const result = exporter.export(transcript, options);
```

## API Endpoints

### GET /api/exports/:debateId/markdown

Export a debate as Markdown.

**Query Parameters:**
- `includeMetadata` (boolean) - Default: true
- `includeProposition` (boolean) - Default: true
- `includePro` (boolean) - Default: true
- `includeCon` (boolean) - Default: true
- `includeModerator` (boolean) - Default: true
- `includeChallenges` (boolean) - Default: false
- `includeTranscript` (boolean) - Default: false
- `format` (string) - 'standard' or 'compact', Default: 'standard'
- `download` (boolean) - If true, sets Content-Disposition header for download

**Example:**
```bash
# Display in browser
curl http://localhost:3000/api/exports/abc123/markdown

# Download as file
curl http://localhost:3000/api/exports/abc123/markdown?download=true -o debate.md

# Minimal export (proposition + Pro + Con only)
curl "http://localhost:3000/api/exports/abc123/markdown?includeModerator=false&includeMetadata=false"

# Full export with everything
curl "http://localhost:3000/api/exports/abc123/markdown?includeChallenges=true&includeTranscript=true"
```

### GET /api/exports/:debateId/preview

Get metadata about available exports without generating the full export.

**Example:**
```bash
curl http://localhost:3000/api/exports/abc123/preview
```

**Response:**
```json
{
  "debateId": "abc123",
  "proposition": "Should AI data centers be subject to a moratorium?",
  "status": "completed",
  "duration": 1800,
  "generatedAt": "2025-12-25T10:00:00.000Z",
  "schemaVersion": "2.0.0",
  "availableFormats": ["markdown"],
  "sections": {
    "pro": {
      "argumentCount": 5,
      "hasAssumptions": true,
      "hasUncertainties": true
    },
    "con": {
      "argumentCount": 4,
      "hasAssumptions": true,
      "hasUncertainties": true
    },
    "moderator": {
      "agreementCount": 2,
      "disagreementCount": 3,
      "decisionHingeCount": 4
    },
    "interventions": 3,
    "utterances": 42
  }
}
```

## Output Format

### Markdown Structure

The Markdown exporter generates clean, readable Markdown with the following structure:

```markdown
# Debate Analysis
[Metadata: generated date, debate ID, duration, status, schema version]

---

## Proposition
[The question being debated, context, original input]

---

## Arguments FOR
[Pro advocate executive summary]

### Key Arguments
[Individual arguments with category, evidence type, confidence]

### Underlying Assumptions
[List of assumptions]

### Key Uncertainties
[List of uncertainties]

---

## Arguments AGAINST
[Same structure as Arguments FOR]

---

## Moderator Synthesis

### Areas of Agreement
[Topics both sides agree on]

### Core Disagreements
[Key points of contention]

### Conflicting Assumptions
[Where Pro and Con have different premises]

### Evidence Gaps
[Missing data or information]

### Key Decision Points
[Critical factors that determine the conclusion]

---

## User Interventions (optional)
[User questions and challenges with responses]

---

## Full Transcript (optional)
[Complete chronological record of all utterances]
```

See `examples/markdown-export-sample.md` for a complete example.

## Testing

Run the export tests:

```bash
npm test tests/export/markdownExporter.test.ts
```

The test suite includes:
- 40+ test cases
- Export with various option combinations
- Section inclusion/exclusion
- Metadata formatting
- Error handling
- Edge cases (empty data, missing sections)

## File Organization

```
export/
├── README.md                   # This file
├── types.ts                    # Shared types for all exporters
├── markdownExporter.ts         # Markdown export implementation
└── index.ts                    # Barrel export
```

## Future Exporters

When implementing new exporters (PDF, audio, video), follow this pattern:

1. Add format-specific options to `types.ts`
2. Create new exporter class (e.g., `pdfExporter.ts`)
3. Implement `export()` method returning `ExportResult`
4. Write comprehensive tests
5. Add API routes
6. Export from `index.ts`

## Dependencies

- **pino** - Logging
- **transcript-recorder** - Source data
- **schema-validator** - Validation

## Related Tasks

- ✅ EXPORT-001: Markdown Export (completed)
- 🚧 EXPORT-002: PDF Export (planned)
- 🚧 AUDIO-001: TTS Integration (planned)
- 🚧 VIDEO-001: Remotion Video Export (planned)

## Notes for Future Developers

### Integration Points

When implementing dependent tasks (EXPORT-002, AUDIO tasks, VIDEO tasks):

1. **Reuse the `DebateTranscript` interface** - The transcript-recorder already provides a well-structured format. Don't create new data structures unless necessary.

2. **Use the export types** - `ExportResult`, `ExportMetadata`, and the options pattern are designed to work across all export formats.

3. **Follow the API pattern** - New exporters should follow the same route pattern:
   - `GET /api/exports/:debateId/{format}` - Generate and return export
   - Query parameters for customization
   - `download=true` for file download

4. **Leverage existing formatting helpers** - The MarkdownExporter has helper methods for formatting durations, timestamps, speakers, etc. These can be reused or extracted to a shared utility.

5. **Test thoroughly** - The test suite demonstrates the expected coverage: options combinations, edge cases, error handling, and format validation.

### Known Considerations

- **File size** - For large debates, consider streaming or chunking for PDF/video exports
- **Async operations** - Markdown is synchronous, but PDF/audio/video may need async processing with job queues (see QUEUE tasks)
- **Storage** - Generated files may need to be stored in S3/CDN (see STORAGE tasks)
- **Caching** - Consider caching generated exports to avoid regeneration

### Lessons Learned

1. **Schema compatibility** - The `DebateTranscript` schema from transcript-recorder works perfectly for exports. No additional transformation needed.

2. **Confidence indicators** - Using emojis (🟢🟡🔴) for confidence levels makes the output more scannable. Consider similar visual cues for other formats.

3. **Section toggling** - Users appreciate the ability to customize exports. Every exporter should support section inclusion/exclusion.

4. **Metadata is essential** - Always include export metadata (generated date, version, source debate ID) for traceability.

5. **Preview endpoint** - The `/preview` endpoint is useful for showing users what's available before generating the full export.
