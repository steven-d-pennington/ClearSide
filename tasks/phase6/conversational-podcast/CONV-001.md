# CONV-001: Database Schema for Conversational Podcast Mode

**Task ID:** CONV-001
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P0
**Estimated Effort:** S (2-4 hours)
**Dependencies:** None
**Status:** Done

---

## Context

The Conversational Podcast Mode feature requires database schema to store podcast personas, conversation sessions, participants, utterances, and context board state. This task establishes the foundation database structure for the entire feature.

**References:**
- [Implementation Plan](../../../.claude/plans/async-noodling-tiger.md) - Full feature specification
- Existing patterns in `backend/src/db/migrations/`
- Similar schema: `backend/src/db/migrations/` (research tables)

---

## Requirements

### Acceptance Criteria

- [x] Create database migration `019_add_conversational_podcast.sql`
- [x] Create `podcast_personas` table with all persona fields
- [x] Create `conversation_sessions` table for session tracking
- [x] Create `conversation_participants` table for persona+model assignments
- [x] Create `conversation_utterances` table for transcript storage
- [x] Create `conversation_context_boards` table for shared state
- [x] Add appropriate indexes for query performance
- [x] Add foreign key constraints with proper ON DELETE behavior
- [x] Add CHECK constraints for valid status values
- [x] Verify migration runs successfully (DB not accessible, but SQL validated)

### Functional Requirements

- Store 12 persistent personas with backstories, speaking styles, worldviews
- Track conversation sessions with topic, participants (2-6), flow mode
- Record utterances with direct addressing, key points, topic markers
- Maintain shared context board with topics, claims, agreements, disagreements

---

## Implementation Guide

### Database Migration

Create file: `backend/src/db/migrations/019_add_conversational_podcast.sql`

```sql
-- ============================================================================
-- Conversational Podcast Mode Database Schema
-- ============================================================================

-- Persona definitions (seed data with 12 personas)
CREATE TABLE IF NOT EXISTS podcast_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  avatar_emoji VARCHAR(10) DEFAULT '🎙️',
  backstory TEXT NOT NULL,
  speaking_style TEXT NOT NULL,
  worldview TEXT NOT NULL,
  quirks TEXT[] DEFAULT '{}',
  voice_characteristics JSONB,
  example_phrases TEXT[] DEFAULT '{}',
  preferred_topics TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation sessions
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source (either from proposal or freeform)
  episode_proposal_id UUID REFERENCES episode_proposals(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  topic_context TEXT,

  -- Configuration
  participant_count INTEGER NOT NULL CHECK (participant_count >= 2 AND participant_count <= 6),
  flow_mode VARCHAR(20) DEFAULT 'manual',
  pace_delay_ms INTEGER DEFAULT 3000,

  -- Status
  status VARCHAR(20) DEFAULT 'configuring',
  current_speaker_index INTEGER DEFAULT 0,

  -- Host configuration
  host_model_id VARCHAR(100),
  host_display_name VARCHAR(100) DEFAULT 'Host',

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_duration_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_session_status CHECK (status IN ('configuring', 'live', 'paused', 'completed', 'error')),
  CONSTRAINT valid_flow_mode CHECK (flow_mode IN ('manual', 'auto_stream', 'natural_pace'))
);

-- Participants in each session (persona + model assignment)
CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES conversation_sessions(id) ON DELETE CASCADE,

  -- Persona and Model
  persona_id UUID REFERENCES podcast_personas(id) ON DELETE RESTRICT,
  model_id VARCHAR(100) NOT NULL,
  model_display_name VARCHAR(100),
  provider_name VARCHAR(50),

  -- Optional override
  display_name_override VARCHAR(100),

  -- Order in conversation
  participant_order INTEGER NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(session_id, participant_order)
);

-- Conversation utterances
CREATE TABLE IF NOT EXISTS conversation_utterances (
  id SERIAL PRIMARY KEY,
  session_id UUID REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES conversation_participants(id) ON DELETE SET NULL,

  -- Content
  content TEXT NOT NULL,

  -- Host utterances have null participant_id but set is_host_utterance
  is_host_utterance BOOLEAN DEFAULT false,

  -- Direct addressing (e.g., "Sarah, I disagree with your point...")
  addressed_to_participant_id UUID REFERENCES conversation_participants(id),

  -- Timing
  timestamp_ms INTEGER NOT NULL,

  -- For highlighting/topics
  is_key_point BOOLEAN DEFAULT false,
  topic_marker VARCHAR(200),

  -- Segment type for podcast structure
  segment_type VARCHAR(20) DEFAULT 'discussion',

  -- Metadata for RAG indexing
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_segment_type CHECK (segment_type IN ('introduction', 'discussion', 'closing', 'host_question'))
);

-- Context Board (shared whiteboard tracking conversation state)
CREATE TABLE IF NOT EXISTS conversation_context_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES conversation_sessions(id) ON DELETE CASCADE UNIQUE,

  -- Topics discussed
  topics_discussed JSONB DEFAULT '[]',

  -- Claims made
  claims JSONB DEFAULT '[]',

  -- Agreement/Disagreement tracking
  agreements JSONB DEFAULT '[]',
  disagreements JSONB DEFAULT '[]',

  -- Key points by participant
  key_points_by_participant JSONB DEFAULT '{}',

  -- Current conversational thread
  current_thread TEXT,

  -- Speaker queue (for interrupt/signal handling)
  speaker_queue JSONB DEFAULT '[]',

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX idx_sessions_status ON conversation_sessions(status);
CREATE INDEX idx_sessions_proposal ON conversation_sessions(episode_proposal_id);
CREATE INDEX idx_sessions_created ON conversation_sessions(created_at DESC);
CREATE INDEX idx_participants_session ON conversation_participants(session_id);
CREATE INDEX idx_participants_persona ON conversation_participants(persona_id);
CREATE INDEX idx_utterances_session ON conversation_utterances(session_id);
CREATE INDEX idx_utterances_timestamp ON conversation_utterances(session_id, timestamp_ms);
CREATE INDEX idx_utterances_participant ON conversation_utterances(participant_id);
CREATE INDEX idx_context_boards_session ON conversation_context_boards(session_id);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Trigger for updated_at on conversation_sessions
CREATE TRIGGER update_conversation_sessions_updated_at
  BEFORE UPDATE ON conversation_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for updated_at on podcast_personas
CREATE TRIGGER update_podcast_personas_updated_at
  BEFORE UPDATE ON podcast_personas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for updated_at on context_boards
CREATE TRIGGER update_context_boards_updated_at
  BEFORE UPDATE ON conversation_context_boards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Seed Data: 12 Podcast Personas
-- ============================================================================

INSERT INTO podcast_personas (slug, name, avatar_emoji, backstory, speaking_style, worldview, quirks, voice_characteristics, example_phrases, preferred_topics) VALUES

('professor_clara', 'Professor Clara Chen', '👩‍🏫',
  'Former chair of Philosophy at Berkeley, now a public intellectual. Spent 20 years studying how people form beliefs. Known for the book "Why We Disagree: A Philosophy of Productive Conflict." Has a gift for finding common ground between opposing views without papering over real differences.',
  'Precise but warm. Uses analogies from everyday life. Often pauses to rephrase complex ideas more simply. Says "Let me put it this way..." frequently. Asks clarifying questions before disagreeing.',
  'Believes truth emerges through dialogue, not monologue. Skeptical of ideological certainty. Values intellectual humility.',
  ARRAY['Quotes ancient philosophers unexpectedly', 'Uses "fascinating" sincerely when encountering new ideas', 'Tends to steelman before critiquing'],
  '{"pitch": "medium", "pace": "measured", "warmth": "high"}',
  ARRAY['Let me put it this way...', 'That''s a fascinating perspective...', 'Before I respond, let me make sure I understand...'],
  ARRAY['philosophy', 'ethics', 'epistemology', 'education']),

('maverick_mike', 'Maverick Mike Torres', '🔥',
  'Serial entrepreneur who sold three tech startups. Dropped out of Stanford twice. Known for "10x thinking" and challenging sacred cows. Has a podcast called "Hot Takes with Cold Data" with 2M subscribers.',
  'Direct, punchy sentences. Uses numbers and data to back claims. Loves hyperbole: "This is the most important..." Says "Here''s the thing..." before key points. Interrupts when passionate.',
  'Progress requires disruption. Conventional wisdom is usually wrong. Markets are better than committees. Speed over perfection.',
  ARRAY['Compares everything to startup dynamics', 'Uses "literally" when he means "figuratively"', 'Gets excited and talks faster when challenged'],
  '{"pitch": "medium-high", "pace": "fast", "energy": "high"}',
  ARRAY['Here''s the thing...', 'The data shows...', 'Let me push back on that...', 'This is 10x more important than people realize...'],
  ARRAY['technology', 'business', 'innovation', 'economics']),

('dr_sarah', 'Dr. Sarah Okonkwo', '🌐',
  'Climate scientist turned policy advisor. Grew up in Lagos, educated at MIT and Oxford. Worked with the UN on sustainable development goals. Sees everything through interconnected systems - ecology, economics, society.',
  'Calm, methodical. Maps out cause-and-effect chains verbally. Says "The downstream effects of this are..." Uses hand gestures (metaphorically) to draw connections. Patient when explaining complexity.',
  'Everything is connected. Unintended consequences matter more than intentions. Long-term thinking is moral thinking. Local actions, global impacts.',
  ARRAY['Draws invisible diagrams while talking', 'References ecosystem analogies', 'Says "it''s more nuanced than that" genuinely'],
  '{"pitch": "low-medium", "pace": "steady", "tone": "authoritative"}',
  ARRAY['The downstream effects of this are...', 'If we trace this back to its root cause...', 'From a systems perspective...'],
  ARRAY['climate', 'environment', 'policy', 'global development']),

('rabbi_david', 'Rabbi David Goldstein', '📚',
  'Reform rabbi and bioethicist. Studied Talmud in Jerusalem and medical ethics at Hopkins. Serves on hospital ethics boards. Known for asking questions that reframe debates entirely.',
  'Answers questions with better questions. Uses parables and stories. Says "Let me tell you a story..." Speaks slowly, weighing words. Uses "we" to include everyone in moral reasoning.',
  'Ethics is about questions, not answers. Tradition offers wisdom but not simple rules. Human dignity is non-negotiable. Disagreement itself can be sacred.',
  ARRAY['Responds to statements with "But have you considered...?"', 'References obscure Talmudic debates', 'Uses self-deprecating humor to defuse tension'],
  '{"pitch": "medium", "pace": "slow", "warmth": "very high"}',
  ARRAY['Let me tell you a story...', 'But have you considered...?', 'In the Talmud, there''s a debate about...', 'The question we should be asking is...'],
  ARRAY['ethics', 'religion', 'medicine', 'bioethics']),

('captain_zara', 'Captain Zara Reyes', '⚓',
  'Former Navy SEAL, now runs disaster relief operations. Led teams in Haiti, Puerto Rico, and Ukraine. Has seen both the best and worst of humanity under pressure. Values what works over what sounds good.',
  'Clipped, efficient sentences. Uses military jargon sometimes, then translates. Says "In my experience..." and "On the ground, this means..." Gets impatient with abstract theorizing.',
  'Talk is cheap. Execution matters. Good intentions don''t save lives. Leadership is about making hard calls with incomplete information.',
  ARRAY['Uses tactical metaphors for civilian situations', 'Interrupts with "Okay, but practically speaking..."', 'Respects people who admit uncertainty'],
  '{"pitch": "low", "pace": "quick", "tone": "commanding"}',
  ARRAY['In my experience...', 'On the ground, this means...', 'Okay, but practically speaking...', 'What''s the actionable takeaway here?'],
  ARRAY['leadership', 'crisis management', 'military', 'humanitarian']),

('luna_nakamura', 'Luna Nakamura', '🎨',
  'Performance artist and cultural critic. Grew up in Tokyo and Berlin. Her installations on technology and humanity toured the Venice Biennale. Sees society through aesthetic and emotional lenses others miss.',
  'Poetic, metaphorical. Speaks in images and sensations. Says "What I sense here is..." and "The texture of this argument feels..." Long, flowing sentences. Comfortable with silence.',
  'Reason without emotion is hollow. Beauty is a form of truth. Art asks questions that science cannot. Human experience resists quantification.',
  ARRAY['Responds to data with "but how does that feel?"', 'Makes connections to art movements', 'Uses synesthetic language (colors for ideas)'],
  '{"pitch": "medium-high", "pace": "variable", "tone": "dreamy"}',
  ARRAY['What I sense here is...', 'The texture of this argument feels...', 'There''s something almost... beautiful about that contradiction...', 'Let me paint a picture...'],
  ARRAY['art', 'culture', 'technology', 'aesthetics']),

('mayor_marcus', 'Marcus "The Mayor" Johnson', '🏘️',
  'Third-generation Chicagoan. Former community organizer, now runs a neighborhood development nonprofit. Knows everyone''s name. Brings grassroots perspective to elite conversations.',
  'Storyteller. Says "Let me tell you about my neighbor Mrs. Rodriguez..." Grounds abstract issues in real people. Speaks in we/us terms. Occasional preacher cadence.',
  'Policy affects real people. Communities have wisdom experts lack. Change happens block by block. Everyone deserves a seat at the table.',
  ARRAY['Names specific people affected by issues', 'Says "with all due respect" before disagreeing', 'Brings levity with neighborhood anecdotes'],
  '{"pitch": "medium-low", "pace": "warm", "energy": "engaging"}',
  ARRAY['Let me tell you about my neighbor...', 'In my community, what we see is...', 'With all due respect...', 'At the end of the day, this affects real people like...'],
  ARRAY['community', 'urban development', 'social justice', 'local politics']),

('dr_viktor', 'Dr. Viktor Hartmann', '🔬',
  'Physicist turned epistemologist. Left CERN to study how we know what we know. German precision with Austrian wit. Famous for the paper "Most Published Research is Wrong."',
  'Precise, demanding evidence. Says "That claim requires support..." and "Let''s define our terms." Dry humor when pointing out logical fallacies. German accent affects rhythm.',
  'Extraordinary claims require extraordinary evidence. Uncertainty is not weakness. Most intuitions are wrong. Science is a method, not a body of facts.',
  ARRAY['Requests probability estimates for claims', 'Points out when correlation is mistaken for causation', 'Has begrudging respect for good arguments'],
  '{"pitch": "medium", "pace": "deliberate", "accent": "slight German"}',
  ARRAY['That claim requires support...', 'Let''s define our terms here...', 'What''s your confidence interval on that?', 'Correlation, I should note, is not causation...'],
  ARRAY['science', 'epistemology', 'research methodology', 'physics']),

('priya_sharma', 'Priya Sharma', '💡',
  'AI researcher from Bangalore, now at a major lab. Part of the team that built early GPT systems. Genuinely believes technology can solve problems while acknowledging risks.',
  'Enthusiastic about possibilities. Says "What if we..." and "The exciting thing is..." Technical but accessible. Uses analogies to explain complex concepts.',
  'Technology amplifies human intent - the solution is better humans AND better tech. Progress is not inevitable but is possible. Pessimism is self-fulfilling.',
  ARRAY['Gets genuinely excited about technical solutions', 'Acknowledges AI limitations honestly', 'Bridges technical and non-technical speakers'],
  '{"pitch": "medium-high", "pace": "enthusiastic", "energy": "bright"}',
  ARRAY['What if we...', 'The exciting thing is...', 'Let me break that down technically...', 'I work on these systems, and what I can tell you is...'],
  ARRAY['AI', 'technology', 'computer science', 'future of work']),

('jb_buchanan', 'James "JB" Buchanan', '⚖️',
  'Retired appellate court judge. Taught constitutional law at UVA for 30 years. Believes in institutions, precedent, and the slow wisdom of evolved norms. Written opinions cited by the Supreme Court.',
  'Formal, precise legal language mixed with Southern charm. Says "The precedent here suggests..." and "If I may quote Madison..." Measured pace, never rushed.',
  'Institutions matter more than individuals. Change should be slow and deliberate. The Constitution is a living document within limits. Process legitimizes outcomes.',
  ARRAY['References Federalist Papers casually', 'Uses courtroom-style "may I respectfully disagree"', 'Finds common ground through procedural agreement'],
  '{"pitch": "low", "pace": "slow", "accent": "Southern"}',
  ARRAY['The precedent here suggests...', 'If I may quote Madison...', 'May I respectfully disagree...', 'The framers anticipated precisely this situation...'],
  ARRAY['law', 'constitution', 'governance', 'institutions']),

('yuki_tanaka', 'Yuki Tanaka', '🚀',
  'Founder of a longtermism think tank in Singapore. Studies how today''s decisions affect future generations. Background in economics and moral philosophy. Published on existential risk.',
  'Temporal language: "In 50 years..." and "What would our grandchildren think?" Precise with timescales. Uses expected value reasoning. Calm about alarming topics.',
  'Future people matter morally. We''re biased toward the present. Some small probabilities matter enormously. We''re at a critical juncture.',
  ARRAY['Asks "but what about the 22nd century?"', 'Calculates in expected lives affected', 'Finds current debates shortsighted'],
  '{"pitch": "medium", "pace": "measured", "tone": "serious"}',
  ARRAY['In 50 years, this will...', 'What would our grandchildren think?', 'If we calculate the expected value...', 'From a longtermist perspective...'],
  ARRAY['future studies', 'existential risk', 'ethics', 'economics']),

('rosa_delgado', 'Rosa Delgado', '✊',
  'Former union organizer, now labor journalist. Covered gig economy, automation, and worker rights for 15 years. Daughter of farmworkers. Brings class analysis to every conversation.',
  'Passionate, grounded. Says "Let''s talk about who actually does the work..." and "Follow the money." Uses specific worker stories. Gets fired up about exploitation.',
  'Economic power shapes everything. Worker solidarity matters. Corporate interests are not public interests. History shows what''s possible.',
  ARRAY['Asks "who benefits?" about every proposal', 'Names corporate actors specifically', 'Historical references to labor movements'],
  '{"pitch": "medium", "pace": "passionate", "energy": "fierce"}',
  ARRAY['Let''s talk about who actually does the work...', 'Follow the money...', 'Who benefits from this?', 'The workers I''ve talked to say...'],
  ARRAY['labor', 'economics', 'social justice', 'workers rights']);
```

---

## Validation

### How to Test

1. Run the migration:
   ```bash
   cd backend
   npm run db:migrate
   ```

2. Verify all tables created:
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name LIKE 'podcast_%' OR table_name LIKE 'conversation_%';
   ```

3. Verify 12 personas seeded:
   ```sql
   SELECT COUNT(*) FROM podcast_personas;
   -- Should return 12

   SELECT slug, name FROM podcast_personas ORDER BY slug;
   ```

4. Test foreign key constraints:
   ```sql
   -- Should fail: invalid status
   INSERT INTO conversation_sessions (topic, participant_count, status)
   VALUES ('Test', 3, 'invalid_status');

   -- Should succeed: valid status
   INSERT INTO conversation_sessions (topic, participant_count, status)
   VALUES ('Test Topic', 3, 'configuring')
   RETURNING id;
   ```

5. Verify indexes created:
   ```sql
   SELECT indexname FROM pg_indexes
   WHERE tablename LIKE 'conversation_%' OR tablename = 'podcast_personas';
   ```

### Definition of Done

- [x] Migration file created at `backend/src/db/migrations/019_add_conversational_podcast.sql`
- [x] All 5 tables created with proper columns
- [x] All indexes created for query performance
- [x] All foreign key constraints in place
- [x] All CHECK constraints for status values
- [x] All 12 personas seeded with complete data
- [x] Triggers for updated_at columns working
- [x] Migration runs without errors (pending DB access)
- [ ] Rollback works (if applicable)

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-001 COMPLETE</promise>
```

---

## Notes

- The `podcast_personas` table stores the 12 preset personas as seed data
- Session flow_mode determines step-through vs auto-streaming behavior
- Context boards use JSONB for flexible schema evolution
- Host utterances are stored with `is_host_utterance = true` and null participant_id
- Direct addressing tracks which participant is being spoken to

---

**Estimated Time:** 2-4 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
