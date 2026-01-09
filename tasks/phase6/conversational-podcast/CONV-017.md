# CONV-017: Entry from Proposals Page

**Task ID:** CONV-017
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P1
**Estimated Effort:** S (2-4 hours)
**Dependencies:** CONV-012 (Config Modal)
**Status:** Done

---

## Context

This task adds a "Launch Conversation" button to the episode proposal detail page, allowing users to start a podcast conversation from an approved proposal.

**References:**
- [CONV-012](./CONV-012.md) - ConversationConfigModal
- Existing: `frontend/src/pages/AdminDuelogicProposalDetailPage.tsx`

---

## Requirements

### Acceptance Criteria

- [x] Add "Launch Conversation" button to proposal detail page
- [x] Button appears alongside existing "Launch Debate" button
- [x] Opens ConversationConfigModal with proposal data pre-filled
- [x] Pass episode proposal ID to session creation
- [x] Navigate to ConversationViewer on launch
- [x] Only show for approved proposals

---

## Implementation Guide

### Update AdminDuelogicProposalDetailPage

Modify `frontend/src/pages/AdminDuelogicProposalDetailPage.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConversationConfigModal } from '../components/ConversationalPodcast/ConversationConfigModal';

// Add to component:
export function AdminDuelogicProposalDetailPage() {
  // ... existing state ...
  const [isConversationModalOpen, setIsConversationModalOpen] = useState(false);
  const navigate = useNavigate();

  // ... existing code ...

  const handleLaunchConversation = (sessionId: string) => {
    setIsConversationModalOpen(false);
    navigate(`/conversation/${sessionId}`);
  };

  return (
    <div className={styles.container}>
      {/* ... existing header ... */}

      {/* Action Buttons Section */}
      {proposal.status === 'approved' && (
        <div className={styles.actionButtons}>
          {/* Existing Launch Debate button */}
          <button
            className={styles.launchButton}
            onClick={() => setIsDebateModalOpen(true)}
          >
            Launch Debate
          </button>

          {/* New Launch Conversation button */}
          <button
            className={`${styles.launchButton} ${styles.conversationButton}`}
            onClick={() => setIsConversationModalOpen(true)}
          >
            🎙️ Launch Conversation
          </button>
        </div>
      )}

      {/* ... existing content ... */}

      {/* Conversation Modal */}
      <ConversationConfigModal
        isOpen={isConversationModalOpen}
        onClose={() => setIsConversationModalOpen(false)}
        onLaunch={handleLaunchConversation}
        initialTopic={proposal.title}
        initialContext={proposal.contextSummary}
        episodeProposalId={proposal.id}
      />
    </div>
  );
}
```

### Add CSS for Conversation Button

Add to `AdminDuelogicProposalDetailPage.module.css`:

```css
.actionButtons {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.launchButton {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.conversationButton {
  background: var(--purple-500);
  color: white;
  border: none;
}

.conversationButton:hover {
  background: var(--purple-600);
}
```

### Add Route for ConversationViewer

Update `frontend/src/App.tsx`:

```tsx
import { ConversationViewer } from './components/ConversationalPodcast/ConversationViewer';

// Add route:
<Route path="/conversation/:sessionId" element={<ConversationViewer />} />
```

---

## Validation

### How to Test

1. Navigate to an approved episode proposal
2. Verify "Launch Conversation" button appears
3. Click button and verify modal opens with proposal data
4. Configure participants and launch
5. Verify navigation to conversation viewer
6. Verify session has episodeProposalId linked

### Definition of Done

- [x] "Launch Conversation" button added to proposal page
- [x] Button only shows for approved proposals
- [x] Modal opens with topic pre-filled from proposal
- [x] Episode proposal ID passed to session
- [x] Navigation to viewer works
- [x] Route configured correctly
- [x] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-017 COMPLETE</promise>
```

---

**Estimated Time:** 2-4 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
