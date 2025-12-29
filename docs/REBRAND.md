# 🎯 ClearSide → Duelogic Rebranding Plan

> **Version:** 1.0
> **Date:** 2025-12-29
> **Status:** Planning Phase

---

## 📊 Executive Summary

**Total References Found:** 239+ occurrences across 100+ files
**Estimated Effort:** 4-6 hours
**Risk Level:** Medium (requires coordinated database/deployment changes)

---

## 🎨 New Brand Identity

### Name Rationale
**Duelogic** = "Duel" + "Logic"
- Evokes adversarial debate (duel)
- Emphasizes logical reasoning
- Memorable, brandable, domain-available

### Naming Conventions
- **Product Name:** Duelogic
- **NPM Scope:** `@duelogic/*`
- **Database:** `duelogic`
- **Docker Containers:** `duelogic-*`
- **Domains:** `duelogic.com`, `*.duelogic.app`
- **Debate Format:** `duelogic-v1`

---

## 📋 Implementation Phases

### **Phase 1: Critical Infrastructure** ⚠️ (Breaking Changes)

These changes require deployment coordination and may cause downtime:

#### 1.1 Package Names (4 files)
```bash
# Root package
package.json: "name": "clearside" → "duelogic"

# Backend package
backend/package.json: "@clearside/backend" → "@duelogic/backend"

# Lock file regeneration required
npm install (root and backend)
```

**Files to Update:**
- `package.json` (line 2)
- `backend/package.json` (line 2)
- `package-lock.json` (regenerate)

#### 1.2 Database Names (12 occurrences)

**Option A: Migration Path (Zero Downtime)** ✅ Recommended
```sql
-- Create new database
CREATE DATABASE duelogic;

-- Migrate data from clearside → duelogic
pg_dump clearside | psql duelogic

-- Update all DATABASE_URL references
-- Verify new database works
-- Drop old database after 48-hour verification period
DROP DATABASE clearside;
```

**Option B: Direct Rename (Requires Downtime)**
```sql
-- Stop all connections to database
ALTER DATABASE clearside RENAME TO duelogic;
```

**Files to Update:**
- `backend/.env.example` (lines 30, 36): `DB_NAME=clearside` → `DB_NAME=duelogic`
- `docker-compose.yml` (lines 12, 41): `POSTGRES_DB: clearside` → `POSTGRES_DB: duelogic`
- `backend/src/db/connection.ts` (line 21): Default database name
- `backend/DATABASE_SETUP.md` (lines 177, 182, 189, 192): All setup instructions
- `docs/IMPLEMENTATION_NOTES.md` (line 1078): DATABASE_URL example
- `frontend/.env.example` (line 7): Comment reference
- `tasks/phase1/configuration/CONFIG-001.md`: Docker database commands
- `tasks/phase1/configuration/PERSONA-001.md`: Docker database commands

#### 1.3 Docker Container Names (6 occurrences)

**File:** `docker-compose.yml`

```yaml
# OLD → NEW
clearside-db → duelogic-db                    # line 7
clearside-backend → duelogic-backend          # line 33
clearside-frontend → duelogic-frontend        # line 85
clearside-network → duelogic-network          # line 137
clearside-db-data → duelogic-db-data          # line 126
```

**Update Docker Compose commands in:**
- Root `package.json` scripts (no change needed - uses env file)
- Documentation referencing container names

#### 1.4 Repository URLs (3 occurrences)

**Action Required:** Rename GitHub repository

```
OLD: https://github.com/steven-d-pennington/ClearSide.git
NEW: https://github.com/steven-d-pennington/Duelogic.git
```

**Files to Update:**
- `package.json` (line 34): `repository.url`
- `backend/package.json` (line 57): `repository.url`
- `README.md` (line 57): Clone instructions in Quick Start

#### 1.5 Domain & URL References (12 occurrences)

**Action Required:** Acquire domains and configure DNS

**Production URLs:**
```
clearside.vercel.app → duelogic.vercel.app
clearside-backend-production.up.railway.app → duelogic-backend.up.railway.app
cdn.clearside.com → cdn.duelogic.com
exports.clearside.app → exports.duelogic.app
api.clearside.app → api.duelogic.app
```

**Schema URLs:**
```
https://clearside.com/schemas/* → https://duelogic.com/schemas/*
```

**Files to Update:**
- `backend/.env.example` (line 49): `FRONTEND_URL=https://clearside.vercel.app`
- `docs/DEPLOYMENT.md` (lines 86, 119): Deployment URLs
- `backend/src/services/llm/openrouter-adapter.ts` (line 49): `X-Title` header
- `docs/10_media-production.md` (lines 74, 164, 211, 423): URL examples
- `tasks/phase1/infrastructure/INFRA-004.md` (line 56): Schema URL
- `tasks/phase1/ui/UI-009.md` (line 512): API endpoint example
- `tasks/phase2/storage/STORAGE-002.md` (line 32): CDN domain

---

### **Phase 2: Application Code** 🔧 (Feature Impact)

#### 2.1 Agent System Prompts (25+ occurrences)

**High Impact:** Changes how AI agents identify themselves

**Files & Changes:**

**Orchestrator Agent:**
- `backend/src/services/agents/orchestrator-agent.ts` (line 207)
- `backend/src/services/agents/prompts/orchestrator-prompts.ts` (line 13)
- `tasks/phase1/agents/AGENT-001.md` (lines 134, 315)
- `tasks/phase1/agents/AGENT-005.md` (line 117)

```typescript
// OLD
"ClearSide, a structured reasoning platform"

// NEW
"Duelogic, a structured reasoning platform"
```

**Pro Advocate Agent:**
- `backend/src/services/agents/prompts/pro-advocate-prompts.ts` (line 26)
- `tasks/phase1/configuration/PERSONA-003.md` (line 48)

```typescript
// OLD
"...in a structured debate on the ClearSide platform"

// NEW
"...in a structured debate on the Duelogic platform"
```

**Con Advocate Agent:**
- `backend/src/services/agents/prompts/con-advocate-prompts.ts` (line 26)
- `tasks/phase1/configuration/PERSONA-003.md` (line 216)

```typescript
// OLD
"...in a structured debate on the ClearSide platform"

// NEW
"...in a structured debate on the Duelogic platform"
```

**Moderator Agent:**
- `backend/src/services/agents/prompts/moderator-prompts.ts` (lines 22, 65, 102)

```typescript
// OLD
"Welcome to ClearSide, a platform for structured reasoning..."

// NEW
"Welcome to Duelogic, a platform for structured reasoning..."
```

**Additional References:**
- `backend/src/services/agents/prompts/index.ts` (line 5)
- `backend/src/services/agents/prompts/quality-validators.ts` (line 5)

#### 2.2 Branding & UI Text (25+ occurrences)

**Demo HTML:**
- `demo/index.html` (line 6): `<title>ClearSide - Structured Reasoning Demo</title>`
- `demo/index.html` (line 745): `<div class="logo">ClearSide</div>`
- `demo/index.html` (line 1211): Mission statement

**Frontend Components:**
- `frontend/src/App.tsx` (line 17): `<h1>ClearSide</h1>`
- `frontend/src/components/Layout/Header.tsx` (line 40): Logo text
- `frontend/src/components/Layout/Footer.tsx` (line 19): Copyright text

**Changes:**
```tsx
// Header
<span className={styles.logoText}>ClearSide</span>
→ <span className={styles.logoText}>Duelogic</span>

// Footer
{currentYear} ClearSide. All rights reserved.
→ {currentYear} Duelogic. All rights reserved.

// Page Titles
<title>ClearSide - Structured Reasoning Demo</title>
→ <title>Duelogic - Structured Reasoning Demo</title>
```

**Additional UI References:**
- `tasks/phase1/ui/UI-005.md` (line 346): Footer copyright specification

#### 2.3 Metadata & Export Artifacts (18+ occurrences)

**Audio ID3 Tags:**
- `backend/src/services/audio/id3-manager.ts` (lines 60, 282)
- `backend/tests/services/audio/id3-manager.test.ts` (lines 38, 64)
- `tasks/phase2/audio-export/AUDIO-004.md` (lines 147, 152)

```typescript
// OLD
artist: 'ClearSide AI Debate'
album: 'ClearSide Debates'
comment: 'Generated by ClearSide'

// NEW
artist: 'Duelogic AI Debate'
album: 'Duelogic Debates'
comment: 'Generated by Duelogic'
```

**Podcast Metadata (27 occurrences):**
- `backend/src/services/agents/prompts/pro-advocate-prompts.ts` (9 lines)
- `backend/src/services/agents/prompts/con-advocate-prompts.ts` (9 lines)
- `backend/src/services/agents/prompts/moderator-prompts.ts` (4 lines)

```typescript
// Podcast author field
author: 'ClearSide' → author: 'Duelogic'
```

**FFmpeg Metadata:**
- `docs/10_media-production.md` (lines 420-421)

```bash
# OLD
-metadata artist="ClearSide"
-metadata album="ClearSide Debates"

# NEW
-metadata artist="Duelogic"
-metadata album="Duelogic Debates"
```

**Package Descriptions:**
- `backend/package.json` (lines 4, 59)
- `package.json` (line 5)

```json
// OLD
"description": "ClearSide Live Debate Theater - Backend API"
"author": "ClearSide Team"

// NEW
"description": "Duelogic Live Debate Theater - Backend API"
"author": "Duelogic Team"
```

#### 2.4 Runtime Configuration Strings (3 occurrences)

**Debate Format Identifier:**

```
OLD: clearside-v1
NEW: duelogic-v1
```

**Files:**
- `docs/09_real-time-architecture.md` (lines 474, 553): Schema definition
- `docs/10_media-production.md` (line 100): Export metadata

```sql
-- Database schema
debate_format VARCHAR(50) DEFAULT 'clearside-v1'
→ debate_format VARCHAR(50) DEFAULT 'duelogic-v1'
```

```json
// API response
"debate_format": "clearside-v1"
→ "debate_format": "duelogic-v1"
```

#### 2.5 Temporary Directory Paths (2 occurrences)

**Audio Processing Directories:**

```typescript
// OLD
/tmp/clearside-audio/work
/tmp/clearside-audio/output

// NEW
/tmp/duelogic-audio/work
/tmp/duelogic-audio/output
```

**Files:**
- `backend/src/services/audio/audio-export-orchestrator.ts` (lines 84-85)
- `backend/src/services/audio/audio-processor.ts` (line 70)

#### 2.6 Design System & CSS (2 occurrences)

**File Headers:**

```css
/* OLD */
/* ClearSide Design Tokens */

/* NEW */
/* Duelogic Design Tokens */
```

**Files:**
- `frontend/src/styles/tokens.css` (line 1)
- `frontend/src/components/ui/index.ts` (line 1)

#### 2.7 Source Code Comments & Headers (8 occurrences)

**File Headers:**
- `backend/src/index.ts` (line 2): `* ClearSide Backend Server`
- `backend/src/types/database.ts` (line 2): `* Database type definitions for ClearSide`
- `backend/src/types/sse.ts` (line 2): `* Server-Sent Events (SSE) type definitions for ClearSide`
- `backend/src/db/migrations/001_create_debates_schema.sql` (line 2): `-- Creates the core schema for ClearSide debates`
- `backend/src/utils/validation/qualityChecks.ts` (line 9): `* Evidence types in ClearSide`
- `backend/src/services/agents/prompts/index.ts` (line 5)
- `backend/src/services/agents/prompts/quality-validators.ts` (line 5)
- `frontend/playwright.config.ts` (line 4): `* Playwright E2E Test Configuration for ClearSide Frontend`
- `frontend/src/__tests__/a11y/colorContrast.test.ts` (line 256): Test suite name
- `backend/src/services/logging/README.md` (line 449): `**Maintained By:** ClearSide Team`

#### 2.8 Audio Script Generation (2 occurrences)

**Welcome/Closing Messages:**
- `backend/src/services/audio/script-generator.ts` (lines 172, 185)

```typescript
// OLD
"Welcome to ClearSide Debate. Today we examine..."
"This has been a ClearSide Debate..."

// NEW
"Welcome to Duelogic Debate. Today we examine..."
"This has been a Duelogic Debate..."
```

---

### **Phase 3: Documentation** 📚 (Non-Breaking)

#### 3.1 Core Documentation (5 files)

**README.md** (15+ occurrences)
- Line 1: `# ClearSide`
- Line 5: Description and tagline
- Lines 30, 139, 170, 260, 387: Section headers
- Line 541: Mission statement
- Line 543: Closing tagline

**CLAUDE.md** (8+ occurrences)
- Lines 1-3: Header and description
- Line 12: Project overview
- Line 48: Key concept
- Line 594: Mission statement reminder
- Line 596: Final note

**ROADMAP.md** (8+ occurrences)
- Line 1: `# ClearSide Product Roadmap`
- Lines throughout: Product name references
- Vision statements and feature descriptions

**CHANGELOG.md** (2 occurrences)
- Line 1: `# Changelog` (header text)
- Project name in entry descriptions

**TASK_SYSTEM_COMPLETE.md** (4+ occurrences)
- Line 1: Header
- Task descriptions and context

#### 3.2 Specification Documents (10 files)

**Vision & Requirements:**
- `docs/01_product-vision.md` (10+ occurrences): Mission statement, vision, tagline
- `docs/REQUIREMENTS.md` (2+ occurrences): Product name in requirements
- `docs/KANBAN.md` (1 occurrence): Board title

**Technical Specifications:**
- `docs/04_json-schema.md` (2 occurrences): Schema namespace
- `docs/08_live-debate-protocol.md` (3+ occurrences): Protocol name references
- `docs/09_real-time-architecture.md` (1 occurrence): `clearside-v1` format
- `docs/10_media-production.md` (12+ occurrences): Export metadata, URLs, branding

**Implementation Docs:**
- `docs/ARCHITECTURE.md` (2 occurrences): System name
- `docs/DEPLOYMENT.md` (4+ occurrences): URLs and deployment targets
- `docs/IMPLEMENTATION_NOTES.md` (2+ occurrences): Notes and examples
- `docs/07_iteration-log.md` (5+ occurrences): Project history

**Other Documentation:**
- `docs/sample-debate-export.md` (1 occurrence): Example exports
- `backend/DATABASE_SETUP.md` (3+ occurrences): Setup instructions
- `backend/CORE-002-IMPLEMENTATION-SUMMARY.md` (5+ occurrences): Implementation summary
- `backend/examples/markdown-export-sample.md` (1 occurrence): Sample file
- `frontend/e2e/README.md` (2+ occurrences): E2E test documentation
- `frontend/src/__tests__/a11y/README.md` (1 occurrence): Accessibility docs

#### 3.3 Task Files (50+ files)

**All Phase 1 Tasks (30 files):**
- `tasks/phase1/infrastructure/INFRA-001.md` through `INFRA-005.md`
- `tasks/phase1/core/CORE-001.md` through `CORE-005.md`
- `tasks/phase1/agents/AGENT-001.md` through `AGENT-005.md`
- `tasks/phase1/ui/UI-001.md` through `UI-009.md`
- `tasks/phase1/testing/TEST-001.md` through `TEST-005.md`
- `tasks/phase1/configuration/CONFIG-001.md` through `CONFIG-007.md`
- `tasks/phase1/configuration/PERSONA-001.md` through `PERSONA-003.md`

**All Phase 2 Tasks (20+ files):**
- `tasks/phase2/text-export/EXPORT-001.md`, `EXPORT-002.md`
- `tasks/phase2/audio-export/AUDIO-001.md` through `AUDIO-004.md`
- `tasks/phase2/video-export/VIDEO-001.md` through `VIDEO-004.md`
- `tasks/phase2/queue/QUEUE-001.md`, `QUEUE-002.md`
- `tasks/phase2/storage/STORAGE-001.md`, `STORAGE-002.md`
- `tasks/phase2/ui/UI-010.md`, `UI-011.md`

**Task System Documentation:**
- `tasks/README.md` (1 occurrence): Guide header
- `tasks/TASK_CREATION_SUMMARY.md` (4+ occurrences): Summary document

---

### **Phase 4: Testing & Validation** ✅

#### 4.1 Update Test Assertions

**E2E Tests:**
- `frontend/e2e/tests/debateFlow.spec.ts` (line 18)
- `tasks/phase1/testing/TEST-003.md` (line 214)

```typescript
// OLD
await expect(page).toHaveTitle(/ClearSide/);

// NEW
await expect(page).toHaveTitle(/Duelogic/);
```

**Component Tests:**
- `frontend/src/components/Layout/Layout.test.tsx` (line 68)

```typescript
// OLD
expect(screen.getByText('ClearSide')).toBeInTheDocument();

// NEW
expect(screen.getByText('Duelogic')).toBeInTheDocument();
```

**Audio Tests:**
- `backend/tests/services/audio/id3-manager.test.ts` (lines 38, 64)

```typescript
// OLD
expect(tags.artist).toBe('ClearSide AI Debate');

// NEW
expect(tags.artist).toBe('Duelogic AI Debate');
```

#### 4.2 E2E Page Objects

**Update Page Object descriptions:**
- `frontend/e2e/pages/DebatePage.ts` (line 4)
- `frontend/e2e/pages/HomePage.ts` (line 4)

```typescript
// OLD
* Page Object Model for the ClearSide Debate Page

// NEW
* Page Object Model for the Duelogic Debate Page
```

#### 4.3 Test Suite Verification

**Commands to run after rebranding:**
```bash
# Backend tests (480+ tests)
cd backend
npm test
npm run test:coverage

# Frontend unit tests (166 tests)
cd frontend
npm run test:run
npm run test:coverage

# E2E tests (40+ tests)
cd frontend
npm run e2e

# Accessibility tests (111 tests)
cd frontend
npm run test:run -- src/__tests__/a11y
```

---

### **Phase 5: Project Configuration** 🔧

#### 5.1 IDE/Editor Configuration

**Files:**
- `.serena/project.yml` (line 83): `project_name: "ClearSide"`
- `.claude/settings.local.json`: Project metadata (if present)

```yaml
# OLD
project_name: "ClearSide"

# NEW
project_name: "Duelogic"
```

---

## 🔄 Migration Strategy

### Recommended Approach: **Phased Rollout with Dual Support**

#### Week 1: Infrastructure Preparation
- [ ] Acquire `duelogic.com` domain
- [ ] Create new Vercel project: `duelogic`
- [ ] Create new Railway project: `duelogic-backend`
- [ ] Set up new PostgreSQL database: `duelogic`
- [ ] Rename GitHub repository (sets up automatic redirect)

#### Week 2: Code Updates (Feature Branch)
- [ ] Create feature branch: `rebrand/duelogic`
- [ ] **Phase 1**: Update all critical infrastructure references
- [ ] **Phase 2**: Update application code and prompts
- [ ] Test locally with Docker
- [ ] Update all environment variables

#### Week 3: Documentation & Testing
- [ ] **Phase 3**: Update all documentation files
- [ ] **Phase 4**: Update and run full test suite
- [ ] Generate new exports to verify metadata
- [ ] QA review on staging environment

#### Week 4: Deployment
- [ ] Deploy backend to new Railway project
- [ ] Run database migration (Option A: new DB with data copy)
- [ ] Deploy frontend to new Vercel project
- [ ] Configure DNS and CDN
- [ ] Set up 301 redirects from old URLs
- [ ] Monitor for 48 hours
- [ ] Archive old deployments after 7 days

---

## 🛠️ Automated Script Option

### Bulk Find-Replace Script

```bash
#!/bin/bash
# rebrand.sh - Automated ClearSide → Duelogic rebranding

echo "🎯 Starting ClearSide → Duelogic rebranding..."

# Backup check
if [ ! -d ".git" ]; then
  echo "❌ Error: Must be run from git repository root"
  exit 1
fi

# Create feature branch
git checkout -b rebrand/duelogic
echo "✅ Created feature branch: rebrand/duelogic"

# Case-sensitive replacements (ClearSide → Duelogic)
echo "🔄 Replacing 'ClearSide' with 'Duelogic'..."
find . -type f \( \
  -name "*.ts" -o \
  -name "*.tsx" -o \
  -name "*.js" -o \
  -name "*.jsx" -o \
  -name "*.json" -o \
  -name "*.md" -o \
  -name "*.sql" -o \
  -name "*.yml" -o \
  -name "*.yaml" -o \
  -name "*.css" -o \
  -name "*.html" \
  \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -exec sed -i 's/ClearSide/Duelogic/g' {} +

# Lowercase replacements (clearside → duelogic)
echo "🔄 Replacing 'clearside' with 'duelogic'..."
find . -type f \( \
  -name "*.ts" -o \
  -name "*.tsx" -o \
  -name "*.js" -o \
  -name "*.jsx" -o \
  -name "*.json" -o \
  -name "*.md" -o \
  -name "*.sql" -o \
  -name "*.yml" -o \
  -name "*.yaml" -o \
  -name "*.css" -o \
  -name "*.html" \
  \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -exec sed -i 's/clearside/duelogic/g' {} +

# Regenerate lock files
echo "📦 Regenerating package-lock.json files..."
npm install --package-lock-only
cd backend && npm install --package-lock-only
cd ../frontend && npm install --package-lock-only
cd ..

# Show summary
echo ""
echo "✅ Rebranding complete!"
echo ""
echo "📊 Summary of changes:"
git diff --stat
echo ""
echo "🔍 Review changes with: git diff"
echo "📝 Commit changes with: git add . && git commit -m 'rebrand: ClearSide → Duelogic'"
echo ""
echo "⚠️  IMPORTANT: Manual steps required:"
echo "1. Rename GitHub repository"
echo "2. Acquire duelogic.com domain"
echo "3. Update deployment environments"
echo "4. Update environment variables"
echo "5. Run full test suite: npm test"
```

**Usage:**
```bash
chmod +x rebrand.sh
./rebrand.sh
```

**⚠️ Warning:** This script is fast but requires thorough review. Recommended to use with feature branch and careful testing.

---

## ✅ Validation Checklist

### Pre-Deployment Checklist

**Code & Configuration:**
- [ ] All `package.json` files updated with new name
- [ ] All `package-lock.json` files regenerated
- [ ] Backend `.env` configured with new database name
- [ ] Frontend `.env` configured with new API URL
- [ ] Docker Compose updated with new container names
- [ ] GitHub repository renamed
- [ ] All hardcoded URLs updated

**Testing:**
- [ ] Backend unit tests passing (480+ tests)
- [ ] Frontend unit tests passing (166 tests)
- [ ] E2E tests passing (40+ tests)
- [ ] Accessibility tests passing (111 tests)
- [ ] Local Docker build successful
- [ ] Audio export generates correct ID3 tags
- [ ] Markdown export has correct branding

**Infrastructure:**
- [ ] New database created: `duelogic`
- [ ] Data migrated from `clearside` (if applicable)
- [ ] New Vercel project created
- [ ] New Railway project created
- [ ] DNS records configured
- [ ] CDN configured (if applicable)

### Post-Deployment Checklist

**Functionality:**
- [ ] Frontend loads at new URL
- [ ] Backend API responding at new URL
- [ ] Database connections working
- [ ] SSE streaming functional
- [ ] Create debate → Success
- [ ] Complete debate → Success
- [ ] Export markdown → Correct branding
- [ ] Export audio → Correct ID3 tags
- [ ] Lively mode → Works with new prompts
- [ ] OpenRouter integration → Correct X-Title header
- [ ] Persona system → Works correctly

**Branding:**
- [ ] Header shows "Duelogic"
- [ ] Footer shows "Duelogic. All rights reserved."
- [ ] Page title is "Duelogic"
- [ ] Agent welcome message says "Welcome to Duelogic"
- [ ] Exported files have "Duelogic" metadata
- [ ] Audio files have "Duelogic AI Debate" artist tag

**Migration:**
- [ ] Old URLs redirect to new URLs (301)
- [ ] Old database backed up
- [ ] Old deployments archived
- [ ] Team notified of new URLs

---

## 📊 Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Database downtime during rename | HIGH | MEDIUM | Use migration strategy with new DB, verify before switching |
| Broken external links to old URLs | MEDIUM | HIGH | Set up 301 redirects, maintain for 6+ months |
| Package registry conflicts (@duelogic) | LOW | LOW | Check npm availability before publish, reserve namespace |
| Cached frontend showing old branding | LOW | MEDIUM | Clear CDN cache, update version numbers, force refresh |
| Old agent prompts in cached debates | LOW | LOW | Prompts stored in DB, old debates unaffected by rebrand |
| Test failures from hardcoded assertions | MEDIUM | HIGH | Update all test files in Phase 4 before deployment |
| Docker volume conflicts | LOW | MEDIUM | Use new volume names, don't reuse old volumes |
| Environment variable misconfig | MEDIUM | MEDIUM | Use checklist, test in staging first |
| URL schema references (clearside.com/schemas) | MEDIUM | LOW | Set up redirects, update documentation |
| Temporary file path conflicts | LOW | LOW | Clean /tmp directories before deployment |

---

## 💰 Cost Estimate

### Domain Acquisition
- `duelogic.com`: ~$10-50/year (depending on registrar)
- `duelogic.app`: ~$15/year
- **Total Domains:** ~$25-65/year

### Development Time
| Phase | Estimated Time | Notes |
|-------|---------------|-------|
| Phase 1 (Critical) | 2-3 hours | Package names, DB, Docker, repos |
| Phase 2 (Application) | 1-2 hours | Prompts, UI, metadata, paths |
| Phase 3 (Documentation) | 1-2 hours | 60+ files, find-replace |
| Phase 4 (Testing) | 1 hour | Update assertions, run suites |
| Phase 5 (Config) | 15 minutes | IDE settings |
| **Total Development:** | **5-8 hours** | Single developer |

### Deployment & Infrastructure
- No additional hosting costs (same providers)
- DNS propagation: 24-48 hours (no cost)
- Database migration: 0-1 hour (depending on data size)
- **Total Deployment:** ~1-2 hours

### **Grand Total:** 6-10 hours + $25-65/year

---

## 📋 Change Summary by Category

| Category | Count | Severity | Notes |
|----------|-------|----------|-------|
| Package Names | 4 | HIGH | Breaking change, requires npm install |
| Database Names | 12 | HIGH | Requires migration or downtime |
| Docker Containers | 6 | HIGH | Requires rebuild, volume migration |
| URLs & Domains | 12 | HIGH | Requires DNS, deployment changes |
| Agent Prompts | 25+ | MEDIUM | Affects all new debates |
| Branding & UI | 25+ | MEDIUM | User-visible changes |
| Metadata | 18+ | MEDIUM | Affects exported files |
| Documentation | 50+ | LOW | Non-breaking, can be gradual |
| Code Comments | 8+ | LOW | Non-functional |
| Runtime Config | 3 | MEDIUM | `clearside-v1` → `duelogic-v1` |
| Project Config | 2 | LOW | IDE settings |
| Tests | 3 | LOW | Assertion updates |
| Temp Paths | 2 | MEDIUM | Filesystem changes |
| **TOTAL** | **~210+** | - | - |

---

## 🎯 Next Steps

### Recommended Sequence

1. **Domain Acquisition** (1 day)
   - Check availability: `duelogic.com`, `duelogic.app`
   - Purchase domains
   - Configure DNS (Vercel, Railway)

2. **Infrastructure Setup** (1 day)
   - Create new Vercel project
   - Create new Railway project
   - Set up new PostgreSQL database
   - Rename GitHub repository

3. **Code Changes** (1 day)
   - Run automated script OR
   - Manual phase-by-phase updates
   - Commit to feature branch

4. **Testing** (1 day)
   - Run all test suites
   - Fix any failures
   - Test on staging environment

5. **Deployment** (1 day)
   - Deploy backend
   - Deploy frontend
   - Configure DNS
   - Set up redirects

6. **Monitoring** (2-7 days)
   - Watch for errors
   - Verify redirects working
   - Monitor user feedback
   - Archive old deployments

---

## 📞 Support & Questions

**For questions about this rebranding plan:**
- Review this document thoroughly
- Check the validation checklists
- Test changes in feature branch first
- Use staging environment before production

**Key Principles:**
1. **Test everything** - Don't assume, verify
2. **Use feature branch** - Never rebrand directly on main
3. **Backup first** - Database, environment vars, deployments
4. **Deploy gradually** - Backend → Frontend → DNS
5. **Monitor closely** - Watch for 48 hours post-deployment

---

*Last Updated: 2025-12-29*
*Version: 1.0*
*Status: Planning Phase*
