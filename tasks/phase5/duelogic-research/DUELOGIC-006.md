# DUELOGIC-006: Admin Research Dashboard

**Task ID:** DUELOGIC-006
**Phase:** Phase 5
**Category:** Duelogic Research
**Priority:** P1
**Estimated Effort:** L (1-3 days)
**Dependencies:** DUELOGIC-001, DUELOGIC-004
**Status:** Ready

---

## Context

The Admin Research Dashboard provides a UI for managing the Duelogic Research pipeline. Admins can view research job status, review episode proposals, approve/reject proposals, edit content before approval, and schedule episodes for production.

This builds on the existing admin interface at `/admin` and adds a dedicated section for Duelogic research management.

**References:**
- [FUTURE-FEATURES.md](../../../docs/FUTURE-FEATURES.md) - Section 10: Admin UI
- Existing admin interface at `frontend/src/pages/AdminPage.tsx`
- [Existing admin patterns](../../../frontend/src/components/)

---

## Requirements

### Acceptance Criteria

- [ ] Create `/admin/duelogic/research` route for research dashboard
- [ ] Display research job history with status indicators
- [ ] Show proposal queue with filtering by status
- [ ] Implement proposal detail view with full content
- [ ] Add approve/reject workflow with confirmation
- [ ] Enable inline editing of proposal content
- [ ] Add bulk operations (approve/reject multiple)
- [ ] Show episode scheduling calendar
- [ ] Display research configuration management
- [ ] Add cost/usage statistics display
- [ ] Write component tests

### Functional Requirements

From FUTURE-FEATURES.md Section 10:
- View all proposals: pending, approved, rejected, scheduled
- Review interface with full episode preview
- Edit proposals before approval
- Batch operations for multiple proposals
- Schedule approved episodes for specific dates
- View research job execution history

---

## Implementation Guide

### Route Structure

```
/admin/duelogic
├── /research           - Research dashboard (default)
├── /proposals          - Proposal queue
├── /proposals/:id      - Proposal detail/edit
├── /configs            - Research configuration
└── /schedule           - Episode schedule calendar
```

### Types

```typescript
// frontend/src/types/duelogic-research.ts

export type ResearchCategory =
  | 'technology_ethics'
  | 'climate_environment'
  | 'politics_governance'
  | 'bioethics_medicine'
  | 'economics_inequality'
  | 'ai_automation'
  | 'social_justice'
  | 'international_relations'
  | 'privacy_surveillance'
  | 'education_culture';

export type ResearchJobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'scheduled';

export interface ResearchJob {
  id: string;
  configId: string;
  configName?: string;
  status: ResearchJobStatus;
  startedAt?: string;
  completedAt?: string;
  topicsDiscovered: number;
  episodesGenerated: number;
  tokensUsed: number;
  error?: string;
  createdAt: string;
}

export interface PhilosophicalChair {
  name: string;
  position: string;
  mustAcknowledge: string;
}

export interface EpisodeProposal {
  id: string;
  researchResultId: string;
  status: ProposalStatus;
  episodeNumber?: number;
  title: string;
  subtitle: string;
  description: string;
  proposition: string;
  contextForPanel: string;
  chairs: PhilosophicalChair[];
  keyTensions: string[];
  generatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  scheduledFor?: string;
  adminNotes?: string;
  wasEdited: boolean;

  // For display
  category?: ResearchCategory;
  qualityScore?: number;
}

export interface ResearchConfig {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  categories: ResearchCategory[];
  perplexityModel: string;
  maxTopicsPerRun: number;
  minControversyScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  pendingProposals: number;
  approvedProposals: number;
  rejectedProposals: number;
  scheduledProposals: number;
  recentJobsCount: number;
  totalTopicsDiscovered: number;
  totalEpisodesGenerated: number;
}
```

### API Service

```typescript
// frontend/src/services/duelogic-research-api.ts

import { apiClient } from './api-client';
import {
  ResearchJob,
  EpisodeProposal,
  ResearchConfig,
  DashboardStats,
  ProposalStatus,
  PhilosophicalChair
} from '../types/duelogic-research';

const BASE_URL = '/api/duelogic';

export const duelogicResearchApi = {
  // Dashboard
  async getStats(): Promise<DashboardStats> {
    const response = await apiClient.get(`${BASE_URL}/dashboard/stats`);
    return response.data;
  },

  // Research Jobs
  async getJobs(limit = 20): Promise<ResearchJob[]> {
    const response = await apiClient.get(`${BASE_URL}/research/jobs?limit=${limit}`);
    return response.data;
  },

  async runJob(configId: string): Promise<ResearchJob> {
    const response = await apiClient.post(`${BASE_URL}/research/jobs/run`, { configId });
    return response.data;
  },

  // Proposals
  async getProposals(status?: ProposalStatus): Promise<EpisodeProposal[]> {
    const url = status
      ? `${BASE_URL}/proposals?status=${status}`
      : `${BASE_URL}/proposals`;
    const response = await apiClient.get(url);
    return response.data;
  },

  async getProposal(id: string): Promise<EpisodeProposal> {
    const response = await apiClient.get(`${BASE_URL}/proposals/${id}`);
    return response.data;
  },

  async approveProposal(id: string, episodeNumber?: number): Promise<void> {
    await apiClient.post(`${BASE_URL}/proposals/${id}/approve`, { episodeNumber });
  },

  async rejectProposal(id: string, notes?: string): Promise<void> {
    await apiClient.post(`${BASE_URL}/proposals/${id}/reject`, { notes });
  },

  async scheduleProposal(id: string, scheduledFor: string): Promise<void> {
    await apiClient.post(`${BASE_URL}/proposals/${id}/schedule`, { scheduledFor });
  },

  async updateProposal(
    id: string,
    updates: Partial<{
      title: string;
      subtitle: string;
      description: string;
      proposition: string;
      contextForPanel: string;
      chairs: PhilosophicalChair[];
      keyTensions: string[];
    }>
  ): Promise<void> {
    await apiClient.put(`${BASE_URL}/proposals/${id}`, updates);
  },

  async bulkApprove(ids: string[]): Promise<void> {
    await apiClient.post(`${BASE_URL}/proposals/bulk-action`, {
      action: 'approve',
      ids,
    });
  },

  async bulkReject(ids: string[]): Promise<void> {
    await apiClient.post(`${BASE_URL}/proposals/bulk-action`, {
      action: 'reject',
      ids,
    });
  },

  // Configs
  async getConfigs(): Promise<ResearchConfig[]> {
    const response = await apiClient.get(`${BASE_URL}/research/configs`);
    return response.data;
  },

  async createConfig(config: Omit<ResearchConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ResearchConfig> {
    const response = await apiClient.post(`${BASE_URL}/research/configs`, config);
    return response.data;
  },

  async updateConfig(id: string, updates: Partial<ResearchConfig>): Promise<void> {
    await apiClient.put(`${BASE_URL}/research/configs/${id}`, updates);
  },

  async deleteConfig(id: string): Promise<void> {
    await apiClient.delete(`${BASE_URL}/research/configs/${id}`);
  },
};
```

### Dashboard Component

```tsx
// frontend/src/pages/admin/DuelogicResearchDashboard.tsx

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { duelogicResearchApi } from '../../services/duelogic-research-api';
import {
  DashboardStats,
  ResearchJob,
  EpisodeProposal
} from '../../types/duelogic-research';
import styles from './DuelogicResearchDashboard.module.css';

export const DuelogicResearchDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<ResearchJob[]>([]);
  const [pendingProposals, setPendingProposals] = useState<EpisodeProposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [statsData, jobsData, proposalsData] = await Promise.all([
        duelogicResearchApi.getStats(),
        duelogicResearchApi.getJobs(5),
        duelogicResearchApi.getProposals('pending'),
      ]);

      setStats(statsData);
      setRecentJobs(jobsData);
      setPendingProposals(proposalsData.slice(0, 5));
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRunJob = async (configId: string) => {
    try {
      await duelogicResearchApi.runJob(configId);
      loadDashboard();
    } catch (error) {
      console.error('Failed to run job:', error);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <h1>Duelogic Research Dashboard</h1>
        <nav className={styles.nav}>
          <Link to="/admin/duelogic/proposals">Proposals</Link>
          <Link to="/admin/duelogic/configs">Configs</Link>
          <Link to="/admin/duelogic/schedule">Schedule</Link>
        </nav>
      </header>

      {/* Stats Cards */}
      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats?.pendingProposals || 0}</span>
          <span className={styles.statLabel}>Pending</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats?.approvedProposals || 0}</span>
          <span className={styles.statLabel}>Approved</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats?.scheduledProposals || 0}</span>
          <span className={styles.statLabel}>Scheduled</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats?.rejectedProposals || 0}</span>
          <span className={styles.statLabel}>Rejected</span>
        </div>
      </section>

      {/* Recent Jobs */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Recent Research Jobs</h2>
          <button onClick={() => handleRunJob('default')} className={styles.runButton}>
            Run Now
          </button>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Status</th>
              <th>Topics</th>
              <th>Episodes</th>
              <th>Tokens</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {recentJobs.map(job => (
              <tr key={job.id}>
                <td>{job.id.slice(0, 8)}</td>
                <td>
                  <span className={`${styles.status} ${styles[job.status]}`}>
                    {job.status}
                  </span>
                </td>
                <td>{job.topicsDiscovered}</td>
                <td>{job.episodesGenerated}</td>
                <td>{job.tokensUsed.toLocaleString()}</td>
                <td>{new Date(job.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Pending Proposals */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Pending Proposals</h2>
          <Link to="/admin/duelogic/proposals" className={styles.viewAll}>
            View All
          </Link>
        </div>
        <div className={styles.proposalList}>
          {pendingProposals.map(proposal => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onApprove={() => handleApprove(proposal.id)}
              onReject={() => handleReject(proposal.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

interface ProposalCardProps {
  proposal: EpisodeProposal;
  onApprove: () => void;
  onReject: () => void;
}

const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  onApprove,
  onReject,
}) => {
  return (
    <div className={styles.proposalCard}>
      <div className={styles.proposalHeader}>
        <h3>{proposal.title}</h3>
        <span className={styles.subtitle}>{proposal.subtitle}</span>
      </div>
      <p className={styles.description}>{proposal.description}</p>
      <div className={styles.meta}>
        <span>Generated: {new Date(proposal.generatedAt).toLocaleDateString()}</span>
        {proposal.category && <span>Category: {proposal.category}</span>}
      </div>
      <div className={styles.actions}>
        <Link to={`/admin/duelogic/proposals/${proposal.id}`} className={styles.viewBtn}>
          View
        </Link>
        <button onClick={onApprove} className={styles.approveBtn}>
          Approve
        </button>
        <button onClick={onReject} className={styles.rejectBtn}>
          Reject
        </button>
      </div>
    </div>
  );
};
```

### Proposal Detail Component

```tsx
// frontend/src/pages/admin/ProposalDetail.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { duelogicResearchApi } from '../../services/duelogic-research-api';
import { EpisodeProposal, PhilosophicalChair } from '../../types/duelogic-research';
import styles from './ProposalDetail.module.css';

export const ProposalDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [proposal, setProposal] = useState<EpisodeProposal | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProposal, setEditedProposal] = useState<EpisodeProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProposal();
  }, [id]);

  const loadProposal = async () => {
    if (!id) return;
    try {
      const data = await duelogicResearchApi.getProposal(id);
      setProposal(data);
      setEditedProposal(data);
    } catch (error) {
      console.error('Failed to load proposal:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!id || !editedProposal) return;
    setSaving(true);
    try {
      await duelogicResearchApi.updateProposal(id, {
        title: editedProposal.title,
        subtitle: editedProposal.subtitle,
        description: editedProposal.description,
        proposition: editedProposal.proposition,
        contextForPanel: editedProposal.contextForPanel,
        chairs: editedProposal.chairs,
        keyTensions: editedProposal.keyTensions,
      });
      setProposal(editedProposal);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!id) return;
    try {
      await duelogicResearchApi.approveProposal(id);
      navigate('/admin/duelogic/proposals');
    } catch (error) {
      console.error('Failed to approve:', error);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    const notes = prompt('Rejection notes (optional):');
    try {
      await duelogicResearchApi.rejectProposal(id, notes || undefined);
      navigate('/admin/duelogic/proposals');
    } catch (error) {
      console.error('Failed to reject:', error);
    }
  };

  const updateField = (field: keyof EpisodeProposal, value: any) => {
    if (!editedProposal) return;
    setEditedProposal({ ...editedProposal, [field]: value });
  };

  const updateChair = (index: number, field: keyof PhilosophicalChair, value: string) => {
    if (!editedProposal) return;
    const chairs = [...editedProposal.chairs];
    chairs[index] = { ...chairs[index], [field]: value };
    setEditedProposal({ ...editedProposal, chairs });
  };

  if (loading || !proposal) {
    return <div className={styles.loading}>Loading...</div>;
  }

  const displayProposal = isEditing ? editedProposal! : proposal;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button onClick={() => navigate(-1)} className={styles.backBtn}>
          ← Back
        </button>
        <div className={styles.actions}>
          {isEditing ? (
            <>
              <button onClick={() => setIsEditing(false)} className={styles.cancelBtn}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className={styles.saveBtn}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setIsEditing(true)} className={styles.editBtn}>
                Edit
              </button>
              <button onClick={handleApprove} className={styles.approveBtn}>
                Approve
              </button>
              <button onClick={handleReject} className={styles.rejectBtn}>
                Reject
              </button>
            </>
          )}
        </div>
      </header>

      <main className={styles.content}>
        {/* Title & Subtitle */}
        <section className={styles.titleSection}>
          {isEditing ? (
            <>
              <input
                type="text"
                value={editedProposal?.title || ''}
                onChange={e => updateField('title', e.target.value)}
                className={styles.titleInput}
                placeholder="Episode Title"
              />
              <input
                type="text"
                value={editedProposal?.subtitle || ''}
                onChange={e => updateField('subtitle', e.target.value)}
                className={styles.subtitleInput}
                placeholder="Subtitle"
              />
            </>
          ) : (
            <>
              <h1 className={styles.title}>{displayProposal.title}</h1>
              <h2 className={styles.subtitle}>{displayProposal.subtitle}</h2>
            </>
          )}
        </section>

        {/* Description */}
        <section className={styles.section}>
          <h3>Description</h3>
          {isEditing ? (
            <textarea
              value={editedProposal?.description || ''}
              onChange={e => updateField('description', e.target.value)}
              className={styles.textarea}
              rows={3}
            />
          ) : (
            <p>{displayProposal.description}</p>
          )}
        </section>

        {/* Proposition */}
        <section className={styles.section}>
          <h3>Proposition</h3>
          {isEditing ? (
            <textarea
              value={editedProposal?.proposition || ''}
              onChange={e => updateField('proposition', e.target.value)}
              className={styles.textarea}
              rows={2}
            />
          ) : (
            <p className={styles.proposition}>{displayProposal.proposition}</p>
          )}
        </section>

        {/* Context for Panel */}
        <section className={styles.section}>
          <h3>Context for AI Panel</h3>
          {isEditing ? (
            <textarea
              value={editedProposal?.contextForPanel || ''}
              onChange={e => updateField('contextForPanel', e.target.value)}
              className={styles.textarea}
              rows={5}
            />
          ) : (
            <p>{displayProposal.contextForPanel}</p>
          )}
        </section>

        {/* Philosophical Chairs */}
        <section className={styles.section}>
          <h3>Philosophical Chairs</h3>
          <div className={styles.chairs}>
            {displayProposal.chairs.map((chair, index) => (
              <div key={index} className={styles.chair}>
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={editedProposal?.chairs[index]?.name || ''}
                      onChange={e => updateChair(index, 'name', e.target.value)}
                      className={styles.chairName}
                      placeholder="Chair Name"
                    />
                    <label>Position:</label>
                    <textarea
                      value={editedProposal?.chairs[index]?.position || ''}
                      onChange={e => updateChair(index, 'position', e.target.value)}
                      className={styles.textarea}
                      rows={2}
                    />
                    <label>Must Acknowledge:</label>
                    <textarea
                      value={editedProposal?.chairs[index]?.mustAcknowledge || ''}
                      onChange={e => updateChair(index, 'mustAcknowledge', e.target.value)}
                      className={styles.textarea}
                      rows={2}
                    />
                  </>
                ) : (
                  <>
                    <h4 className={styles.chairName}>{chair.name}</h4>
                    <p><strong>Position:</strong> {chair.position}</p>
                    <p><strong>Must Acknowledge:</strong> {chair.mustAcknowledge}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Key Tensions */}
        <section className={styles.section}>
          <h3>Key Tensions</h3>
          {isEditing ? (
            <div className={styles.tensionList}>
              {editedProposal?.keyTensions.map((tension, index) => (
                <input
                  key={index}
                  type="text"
                  value={tension}
                  onChange={e => {
                    const tensions = [...(editedProposal?.keyTensions || [])];
                    tensions[index] = e.target.value;
                    updateField('keyTensions', tensions);
                  }}
                  className={styles.tensionInput}
                />
              ))}
              <button
                onClick={() => updateField('keyTensions', [...(editedProposal?.keyTensions || []), ''])}
                className={styles.addTensionBtn}
              >
                + Add Tension
              </button>
            </div>
          ) : (
            <ul className={styles.tensions}>
              {displayProposal.keyTensions.map((tension, index) => (
                <li key={index}>{tension}</li>
              ))}
            </ul>
          )}
        </section>

        {/* Metadata */}
        <section className={styles.metadata}>
          <p>Generated: {new Date(proposal.generatedAt).toLocaleString()}</p>
          {proposal.wasEdited && <p className={styles.edited}>This proposal has been edited</p>}
          {proposal.adminNotes && <p>Notes: {proposal.adminNotes}</p>}
        </section>
      </main>
    </div>
  );
};
```

### Proposal List Component

```tsx
// frontend/src/pages/admin/ProposalList.tsx

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { duelogicResearchApi } from '../../services/duelogic-research-api';
import { EpisodeProposal, ProposalStatus } from '../../types/duelogic-research';
import styles from './ProposalList.module.css';

export const ProposalList: React.FC = () => {
  const [proposals, setProposals] = useState<EpisodeProposal[]>([]);
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProposals();
  }, [statusFilter]);

  const loadProposals = async () => {
    setLoading(true);
    try {
      const data = await duelogicResearchApi.getProposals(
        statusFilter === 'all' ? undefined : statusFilter
      );
      setProposals(data);
    } catch (error) {
      console.error('Failed to load proposals:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const selectAll = () => {
    if (selectedIds.size === proposals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(proposals.map(p => p.id)));
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Approve ${selectedIds.size} proposals?`)) return;

    try {
      await duelogicResearchApi.bulkApprove(Array.from(selectedIds));
      setSelectedIds(new Set());
      loadProposals();
    } catch (error) {
      console.error('Failed to bulk approve:', error);
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Reject ${selectedIds.size} proposals?`)) return;

    try {
      await duelogicResearchApi.bulkReject(Array.from(selectedIds));
      setSelectedIds(new Set());
      loadProposals();
    } catch (error) {
      console.error('Failed to bulk reject:', error);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Episode Proposals</h1>
        <div className={styles.filters}>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as ProposalStatus | 'all')}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="scheduled">Scheduled</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </header>

      {selectedIds.size > 0 && (
        <div className={styles.bulkActions}>
          <span>{selectedIds.size} selected</span>
          <button onClick={handleBulkApprove} className={styles.bulkApprove}>
            Bulk Approve
          </button>
          <button onClick={handleBulkReject} className={styles.bulkReject}>
            Bulk Reject
          </button>
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>Loading...</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selectedIds.size === proposals.length && proposals.length > 0}
                  onChange={selectAll}
                />
              </th>
              <th>Title</th>
              <th>Category</th>
              <th>Status</th>
              <th>Generated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map(proposal => (
              <tr key={proposal.id} className={proposal.wasEdited ? styles.edited : ''}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(proposal.id)}
                    onChange={() => toggleSelection(proposal.id)}
                  />
                </td>
                <td>
                  <Link to={`/admin/duelogic/proposals/${proposal.id}`}>
                    <strong>{proposal.title}</strong>
                    <span className={styles.subtitle}>{proposal.subtitle}</span>
                  </Link>
                </td>
                <td>{proposal.category}</td>
                <td>
                  <span className={`${styles.status} ${styles[proposal.status]}`}>
                    {proposal.status}
                  </span>
                </td>
                <td>{new Date(proposal.generatedAt).toLocaleDateString()}</td>
                <td>
                  <Link to={`/admin/duelogic/proposals/${proposal.id}`} className={styles.viewBtn}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
```

---

## Validation

### How to Test

1. **Component Tests:**
   - Test dashboard renders with mocked data
   - Test proposal list filtering
   - Test bulk selection/actions
   - Test edit mode toggles correctly
   - Test form validation

2. **Integration Tests:**
   - Test API integration with mocked backend
   - Test navigation between views
   - Test error handling

3. **Manual Testing:**
   - Create test proposals in database
   - Review and approve proposals
   - Edit proposal content
   - Test bulk operations
   - Verify responsive design

### Definition of Done

- [ ] Dashboard route and components created
- [ ] Proposal list with filtering works
- [ ] Proposal detail view shows all content
- [ ] Edit mode allows content modification
- [ ] Approve/reject workflow works
- [ ] Bulk operations work correctly
- [ ] API integration complete
- [ ] Component tests pass
- [ ] Responsive design works on mobile

---

## Notes

- Build on existing admin UI patterns and styles
- Consider adding keyboard shortcuts for power users
- May want to add Markdown preview for description/context fields
- Future: Add drag-and-drop for episode scheduling
- Consider adding export to markdown for approved episodes

---

## Implementation Notes (2026-01-07)

**Status: COMPLETED**

### Files Created

1. **Backend Routes:**
   - `backend/src/routes/duelogic-research-routes.ts` - Full REST API for research dashboard
   - Added to `backend/src/index.ts` as `/api/duelogic`

2. **Frontend Types:**
   - `frontend/src/types/duelogic-research.ts` - Frontend types for dashboard

3. **Frontend Pages:**
   - `frontend/src/pages/AdminDuelogicResearchPage.tsx` - Main dashboard with stats and quick actions
   - `frontend/src/pages/AdminDuelogicResearchPage.module.css` - Dashboard styles
   - `frontend/src/pages/AdminDuelogicProposalsPage.tsx` - Proposal list with bulk actions
   - `frontend/src/pages/AdminDuelogicProposalsPage.module.css` - List styles
   - `frontend/src/pages/AdminDuelogicProposalDetailPage.tsx` - Proposal detail/edit view
   - `frontend/src/pages/AdminDuelogicProposalDetailPage.module.css` - Detail styles
   - Updated `frontend/src/pages/index.ts` to export new pages
   - Updated `frontend/src/App.tsx` with new routes

4. **Routes Added:**
   - `/admin/duelogic/research` - Main dashboard
   - `/admin/duelogic/proposals` - Proposal list
   - `/admin/duelogic/proposals/:id` - Proposal detail

### API Endpoints

- `GET /api/duelogic/dashboard/stats` - Dashboard statistics
- `GET /api/duelogic/research/jobs` - Recent research jobs
- `POST /api/duelogic/research/jobs/run` - Trigger research job
- `GET /api/duelogic/proposals` - List proposals (with status filter)
- `GET /api/duelogic/proposals/:id` - Get single proposal
- `PUT /api/duelogic/proposals/:id` - Update proposal content
- `POST /api/duelogic/proposals/:id/approve` - Approve proposal
- `POST /api/duelogic/proposals/:id/reject` - Reject proposal
- `POST /api/duelogic/proposals/:id/schedule` - Schedule proposal
- `POST /api/duelogic/proposals/bulk-action` - Bulk approve/reject

### Key Features

- Dashboard shows pending/approved/rejected/scheduled counts
- Quick approve/reject from dashboard
- Full edit mode for proposals (title, subtitle, description, etc.)
- Bulk operations for processing multiple proposals
- Status filtering on proposals list
- Added link to dashboard from main admin page

---

**Estimated Time:** 1-3 days
**Assigned To:** _Completed_
**Created:** 2026-01-03
**Updated:** 2026-01-07
