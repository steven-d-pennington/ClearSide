# CONV-018: Entry from Main Screen

**Task ID:** CONV-018
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P1
**Estimated Effort:** S (2-4 hours)
**Dependencies:** CONV-012 (Config Modal)
**Status:** Done

---

## Context

This task adds a "Start Conversation" entry point from the main application screen, allowing users to create freeform podcast conversations without needing a Duelogic proposal.

**References:**
- [CONV-012](./CONV-012.md) - ConversationConfigModal
- Existing: `frontend/src/pages/HomePage.tsx`

---

## Requirements

### Acceptance Criteria

- [x] Add "Start Conversation" button/card to homepage
- [x] Button opens ConversationConfigModal
- [x] No pre-filled data (user enters topic manually)
- [x] Navigate to ConversationViewer on launch
- [x] Card design consistent with existing homepage style

---

## Implementation Guide

### Update HomePage

Modify `frontend/src/pages/HomePage.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConversationConfigModal } from '../components/ConversationalPodcast/ConversationConfigModal';

export function HomePage() {
  const [isConversationModalOpen, setIsConversationModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleLaunchConversation = (sessionId: string) => {
    setIsConversationModalOpen(false);
    navigate(`/conversation/${sessionId}`);
  };

  return (
    <div className={styles.container}>
      {/* ... existing hero section ... */}

      <section className={styles.actionsSection}>
        <h2 className={styles.sectionTitle}>What would you like to do?</h2>

        <div className={styles.actionCards}>
          {/* Existing Debate Card */}
          <ActionCard
            icon="⚔️"
            title="Launch a Debate"
            description="Two AI advocates argue opposing positions on a topic"
            onClick={() => navigate('/debates/new')}
          />

          {/* Existing Proposal Card */}
          <ActionCard
            icon="📋"
            title="Browse Proposals"
            description="View and manage episode proposals from Duelogic research"
            onClick={() => navigate('/admin/proposals')}
          />

          {/* New Conversation Card */}
          <ActionCard
            icon="🎙️"
            title="Start a Conversation"
            description="Host a podcast-style discussion with 2-6 AI personas"
            onClick={() => setIsConversationModalOpen(true)}
            variant="featured"
          />
        </div>
      </section>

      {/* ... existing content ... */}

      <ConversationConfigModal
        isOpen={isConversationModalOpen}
        onClose={() => setIsConversationModalOpen(false)}
        onLaunch={handleLaunchConversation}
      />
    </div>
  );
}

// Action Card Component
interface ActionCardProps {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
  variant?: 'default' | 'featured';
}

function ActionCard({ icon, title, description, onClick, variant = 'default' }: ActionCardProps) {
  return (
    <button
      className={`${styles.actionCard} ${variant === 'featured' ? styles.featured : ''}`}
      onClick={onClick}
    >
      <span className={styles.cardIcon}>{icon}</span>
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.cardDescription}>{description}</p>
      <span className={styles.cardArrow}>→</span>
    </button>
  );
}
```

### Add CSS for Action Cards

Add to `HomePage.module.css`:

```css
.actionsSection {
  padding: 3rem 0;
}

.sectionTitle {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 2rem;
  text-align: center;
  color: var(--text-primary);
}

.actionCards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  max-width: 1000px;
  margin: 0 auto;
}

.actionCard {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 1.5rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.actionCard:hover {
  border-color: var(--primary-300);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.actionCard.featured {
  background: linear-gradient(135deg, var(--purple-50) 0%, var(--bg-secondary) 100%);
  border-color: var(--purple-200);
}

.actionCard.featured:hover {
  border-color: var(--purple-400);
}

.cardIcon {
  font-size: 2rem;
  margin-bottom: 1rem;
}

.cardTitle {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
}

.cardDescription {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0;
  flex: 1;
}

.cardArrow {
  margin-top: 1rem;
  font-size: 1.25rem;
  color: var(--primary);
  opacity: 0;
  transform: translateX(-8px);
  transition: all 0.2s;
}

.actionCard:hover .cardArrow {
  opacity: 1;
  transform: translateX(0);
}
```

---

## Validation

### How to Test

1. Navigate to homepage
2. Verify "Start Conversation" card appears
3. Click card and verify modal opens (empty topic)
4. Enter topic, configure participants, launch
5. Verify navigation to conversation viewer

### Definition of Done

- [x] "Start Conversation" action card added
- [x] Card opens config modal
- [x] Modal opens with empty fields
- [x] Navigation to viewer works after launch
- [x] Card styling consistent with homepage
- [x] Featured variant highlights the new feature
- [x] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-018 COMPLETE</promise>
```

---

**Estimated Time:** 2-4 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
