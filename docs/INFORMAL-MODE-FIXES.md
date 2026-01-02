# Informal Discussion Mode - Bug Fixes Tracking

## Issue Summary

During Playwright testing of the Informal Discussion feature, several critical issues were discovered that prevent the feature from working correctly.

**Date Identified:** 2026-01-01
**Status:** ✅ Verified Working (All Tests Passed)

---

## Issues Identified

### 1. Informal Mode Not Activating (CRITICAL)
**Status:** [x] Fixed

**Symptom:** When user selects "Informal Discussion" mode, configures participants, and clicks "Start Discussion", the system falls back to traditional turn-based debate mode instead.

**Root Cause:** The frontend Speaker enum only had PRO, CON, MODERATOR, SYSTEM - it didn't recognize 'participant_1', 'participant_2' etc. sent by the informal orchestrator, so the utterance handler fell back to MODERATOR.

**Fix Applied:**
- Added `PARTICIPANT_1`, `PARTICIPANT_2`, `PARTICIPANT_3`, `PARTICIPANT_4` to Speaker enum (frontend/src/types/debate.ts)
- Added `INFORMAL` and `WRAPUP` phases to DebatePhase enum
- Added SSE event handlers for informal mode events (discussion_started, exchange_complete, entering_wrapup, end_detection_result, discussion_summary, discussion_complete)
- Updated utterance handler to recognize informal participants and phases

---

### 2. Model Selection Ignored (CRITICAL)
**Status:** [x] Fixed

**Symptom:** User-selected models (Claude 3.5 Haiku, GPT-4o) are replaced with default models.

**Root Cause:** The frontend was correctly sending model IDs, but the utterance handler wasn't capturing the model info from informal mode events.

**Fix Applied:**
- Updated utterance handler to capture `model`, `speakerName`, `exchangeNumber`, `isWrapUp` from informal mode events
- Store model info in turn metadata
- Added `debateMode` field to Debate interface

---

### 3. Wrong UI Template for Streaming (HIGH)
**Status:** [x] Fixed

**Symptom:** Informal discussions show the debate streaming UI with Pro/Con format instead of a multi-participant discussion format.

**Fix Applied:**
- Created new informal mode UI in DebateStage component
- Shows topic header with exchange counter instead of phase timeline
- Displays participant panels with names and model info
- Color-coded participant cards (indigo, pink, amber, teal)
- Shows discussion summary when completed
- Added CSS styles for informal mode layout

---

### 4. Empty Proposition Display (MEDIUM)
**Status:** [x] Fixed

**Symptom:** The proposition/topic field in the stream header is empty during informal discussions.

**Fix Applied:**
- Informal mode UI now prominently displays the topic in the header
- Exchange counter shows progress (e.g., "Exchange 3 / 15")
- Wrap-up phase indicator shows when discussion is wrapping up

---

### 5. Participant Content Not Displaying (HIGH)
**Status:** [x] Fixed

**Symptom:** Participant panels showed "Waiting to speak..." even though utterances were being received and turns were being added to the store.

**Root Cause:** The `InformalSettingsInput.participants` array from the input form doesn't include an `id` field, but `getParticipantContent()` in DebateStage.tsx looks up turns by `participant.id`. The mismatch caused content lookup to fail.

**Fix Applied:**
- Modified debate-store.ts to transform participants when initializing debate state
- Added `id: \`participant_${idx + 1}\`` to each participant during initialization
- This ensures participant IDs match the speaker IDs sent by the backend (participant_1, participant_2, etc.)

**Code Change:**
```typescript
// frontend/src/stores/debate-store.ts - lines 351-359
informalParticipants: isInformal && options.informalSettings?.participants
  ? options.informalSettings.participants.map((p, idx) => ({
      id: `participant_${idx + 1}`,
      name: p.name || `Participant ${idx + 1}`,
      modelId: p.modelId,
      persona: p.persona,
    }))
  : undefined,
```

---

## Files Modified

| File | Changes |
|------|---------|
| `frontend/src/types/debate.ts` | Added participant speakers, informal phases, informal events, debateMode field, isInformalParticipant helper |
| `frontend/src/stores/debate-store.ts` | Added informal mode selectors, SSE handlers for informal events, updated utterance handler |
| `frontend/src/components/DebateStage/DebateStage.tsx` | Added informal mode UI with participant panels and summary display |
| `frontend/src/components/DebateStage/DebateStage.module.css` | Added CSS styles for informal mode layout |

---

## Progress Log

### 2026-01-01 - Initial Investigation
- Discovered issues via Playwright testing
- Created this tracking document
- Beginning debug phase

### 2026-01-01 - All Fixes Implemented
- Added participant speakers to Speaker enum
- Added INFORMAL and WRAPUP phases
- Added SSE event handlers for all informal mode events
- Created distinct UI for informal discussions
- Updated utterance handler to properly process informal mode data
- Added CSS styles for informal mode layout
- Added informal mode selectors to the store

### 2026-01-01 - Participant Content Fix
- Discovered participant panels showing "Waiting to speak..." despite receiving utterances
- Root cause: `InformalSettingsInput.participants` missing `id` field
- Fixed by transforming participants array to add IDs during initialization

### 2026-01-01 - Testing Complete ✅
- All fixes verified working via Playwright browser testing
- Tested 2-participant informal discussion with Claude 3.5 Haiku and GPT-4o
- Topic displayed correctly in header
- Exchange counter updated correctly (0/15 → 1/15)
- Participant content streamed into correct panels
- Model names displayed in participant headers
- Color-coded participant cards working

---

## Test Results

**Test Configuration:**
- Mode: Informal Discussion
- Participants: 2 (Participant A: claude-3.5-haiku, Participant B: gpt-4o)
- Topic: "What makes a great cup of coffee?"
- Max Exchanges: 15

**Verified Working:**
- [x] Topic displays in header
- [x] Exchange counter shows progress (e.g., "1 / 15")
- [x] Participant names display correctly
- [x] Model names display in participant headers
- [x] Content streams into correct participant panels
- [x] Color-coded panels (indigo, pink)
- [x] UI updates in real-time as responses stream

---

## Summary

All 5 issues have been identified and fixed. The Informal Discussion feature is now fully functional:

1. ✅ Informal mode activates correctly
2. ✅ Model selections are preserved
3. ✅ Correct UI template is used
4. ✅ Proposition/topic displays in header
5. ✅ Participant content displays correctly

