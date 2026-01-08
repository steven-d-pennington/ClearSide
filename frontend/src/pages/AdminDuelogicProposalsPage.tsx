/**
 * AdminDuelogicProposalsPage
 *
 * List of all episode proposals with filtering and bulk actions
 * Redesigned with Command Center Editorial theme
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button, Alert } from '../components/ui';
import styles from './AdminDuelogicProposalsPage.module.css';
import type {
  EpisodeProposal,
  ProposalStatus,
  ResearchCategory,
} from '../types/duelogic-research';
import { CATEGORY_LABELS } from '../types/duelogic-research';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

type SortField = 'generatedAt' | 'titleHookStrength' | 'trendAlignment' | 'controversyBalance' | 'title';
type SortDirection = 'asc' | 'desc';

const TITLE_PATTERNS = ['Compound Mystery', 'Provocative Question', 'Binary Choice', 'Hidden Truth', 'Countdown'];

export function AdminDuelogicProposalsPage() {
  const [proposals, setProposals] = useState<EpisodeProposal[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filter states
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<ResearchCategory | 'all'>('all');
  const [patternFilter, setPatternFilter] = useState<string>('all');
  const [minHookScore, setMinHookScore] = useState<number>(0);
  const [minTrendScore, setMinTrendScore] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sort states
  const [sortField, setSortField] = useState<SortField>('generatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // View mode
  const [viewMode, setViewMode] = useState<'cards' | 'compact'>('cards');

  const fetchProposals = useCallback(async () => {
    setIsLoading(true);
    try {
      const proposalsRes = await fetch(`${API_BASE_URL}/api/duelogic/proposals`);

      if (!proposalsRes.ok) throw new Error('Failed to fetch proposals');

      const proposalsData = await proposalsRes.json();
      setProposals(proposalsData);

      setError(null);
    } catch (err) {
      console.error('Error fetching proposals:', err);
      setError(err instanceof Error ? err.message : 'Failed to load proposals');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  // Filter and sort proposals
  const filteredProposals = useMemo(() => {
    let result = [...proposals];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter(p => p.category === categoryFilter);
    }

    // Title pattern filter
    if (patternFilter !== 'all') {
      result = result.filter(p => p.viralMetrics?.titlePattern === patternFilter);
    }

    // Hook score filter
    if (minHookScore > 0) {
      result = result.filter(p => (p.viralMetrics?.titleHookStrength || 0) >= minHookScore / 100);
    }

    // Trend score filter
    if (minTrendScore > 0) {
      result = result.filter(p => (p.viralMetrics?.trendAlignment || 0) >= minTrendScore / 100);
    }

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.title.toLowerCase().includes(query) ||
        p.subtitle.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case 'generatedAt':
          aVal = new Date(a.generatedAt).getTime();
          bVal = new Date(b.generatedAt).getTime();
          break;
        case 'titleHookStrength':
          aVal = a.viralMetrics?.titleHookStrength || 0;
          bVal = b.viralMetrics?.titleHookStrength || 0;
          break;
        case 'trendAlignment':
          aVal = a.viralMetrics?.trendAlignment || 0;
          bVal = b.viralMetrics?.trendAlignment || 0;
          break;
        case 'controversyBalance':
          aVal = a.viralMetrics?.controversyBalance || 0;
          bVal = b.viralMetrics?.controversyBalance || 0;
          break;
        case 'title':
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return result;
  }, [proposals, statusFilter, categoryFilter, patternFilter, minHookScore, minTrendScore, searchQuery, sortField, sortDirection]);

  // Get unique categories from proposals
  const availableCategories = useMemo(() => {
    const cats = new Set<ResearchCategory>();
    proposals.forEach(p => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [proposals]);

  // Stats
  const stats = useMemo(() => {
    const pending = proposals.filter(p => p.status === 'pending').length;
    const approved = proposals.filter(p => p.status === 'approved').length;
    const scheduled = proposals.filter(p => p.status === 'scheduled').length;
    const rejected = proposals.filter(p => p.status === 'rejected').length;
    const avgHook = proposals.length > 0
      ? proposals.reduce((sum, p) => sum + (p.viralMetrics?.titleHookStrength || 0), 0) / proposals.length
      : 0;
    return { pending, approved, scheduled, rejected, avgHook };
  }, [proposals]);

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const selectAllFiltered = () => {
    if (selectedIds.size === filteredProposals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProposals.map(p => p.id)));
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Approve ${selectedIds.size} proposals?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/bulk-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', ids: Array.from(selectedIds) }),
      });

      if (response.ok) {
        setActionMessage({ type: 'success', text: `Approved ${selectedIds.size} proposals` });
        setSelectedIds(new Set());
        fetchProposals();
      } else {
        setActionMessage({ type: 'error', text: 'Failed to approve proposals' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to approve proposals' });
    }
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Reject ${selectedIds.size} proposals?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/bulk-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', ids: Array.from(selectedIds) }),
      });

      if (response.ok) {
        setActionMessage({ type: 'success', text: `Rejected ${selectedIds.size} proposals` });
        setSelectedIds(new Set());
        fetchProposals();
      } else {
        setActionMessage({ type: 'error', text: 'Failed to reject proposals' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to reject proposals' });
    }
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleQuickApprove = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        setActionMessage({ type: 'success', text: 'Proposal approved' });
        fetchProposals();
      } else {
        setActionMessage({ type: 'error', text: 'Failed to approve proposal' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to approve proposal' });
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleQuickReject = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        setActionMessage({ type: 'success', text: 'Proposal rejected' });
        fetchProposals();
      } else {
        setActionMessage({ type: 'error', text: 'Failed to reject proposal' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to reject proposal' });
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getScoreClass = (score: number): string => {
    if (score >= 0.7) return styles.scoreHigh;
    if (score >= 0.4) return styles.scoreMedium;
    return styles.scoreLow;
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setCategoryFilter('all');
    setPatternFilter('all');
    setMinHookScore(0);
    setMinTrendScore(0);
    setSearchQuery('');
  };

  const hasActiveFilters = statusFilter !== 'all' || categoryFilter !== 'all' || patternFilter !== 'all' || minHookScore > 0 || minTrendScore > 0 || searchQuery.trim() !== '';

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.loadingSpinner} />
          Loading proposals...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <Alert variant="error">{error}</Alert>
        <Button onClick={fetchProposals} className={styles.retryButton}>Retry</Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link to="/admin/duelogic/research" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Research Dashboard
      </Link>

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Episode Proposals</h1>
          <span className={styles.countBadge}>{filteredProposals.length} of {proposals.length}</span>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewBtn} ${viewMode === 'cards' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('cards')}
              title="Card View"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              className={`${styles.viewBtn} ${viewMode === 'compact' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('compact')}
              title="Compact View"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <section className={styles.statsBar}>
        <div className={`${styles.statPill} ${styles.statPending}`} onClick={() => setStatusFilter('pending')}>
          <span className={styles.statValue}>{stats.pending}</span>
          <span className={styles.statLabel}>Pending</span>
        </div>
        <div className={`${styles.statPill} ${styles.statApproved}`} onClick={() => setStatusFilter('approved')}>
          <span className={styles.statValue}>{stats.approved}</span>
          <span className={styles.statLabel}>Approved</span>
        </div>
        <div className={`${styles.statPill} ${styles.statScheduled}`} onClick={() => setStatusFilter('scheduled')}>
          <span className={styles.statValue}>{stats.scheduled}</span>
          <span className={styles.statLabel}>Scheduled</span>
        </div>
        <div className={`${styles.statPill} ${styles.statRejected}`} onClick={() => setStatusFilter('rejected')}>
          <span className={styles.statValue}>{stats.rejected}</span>
          <span className={styles.statLabel}>Rejected</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statPill}>
          <span className={styles.statValue}>{Math.round(stats.avgHook * 100)}%</span>
          <span className={styles.statLabel}>Avg Hook</span>
        </div>
      </section>

      {actionMessage && (
        <Alert variant={actionMessage.type} className={styles.actionAlert}>
          {actionMessage.text}
        </Alert>
      )}

      {/* Filters Section */}
      <section className={styles.filtersSection}>
        <div className={styles.searchRow}>
          <div className={styles.searchInput}>
            <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search titles, subtitles, descriptions..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={styles.searchField}
            />
            {searchQuery && (
              <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {hasActiveFilters && (
            <button className={styles.clearFiltersBtn} onClick={clearFilters}>
              Clear All Filters
            </button>
          )}
        </div>

        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as ProposalStatus | 'all')}
              className={styles.filterSelect}
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="scheduled">Scheduled</option>
              <option value="rejected">Rejected</option>
              <option value="launched">Launched</option>
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Category</label>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value as ResearchCategory | 'all')}
              className={styles.filterSelect}
            >
              <option value="all">All Categories</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Title Pattern</label>
            <select
              value={patternFilter}
              onChange={e => setPatternFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">All Patterns</option>
              {TITLE_PATTERNS.map(pattern => (
                <option key={pattern} value={pattern}>{pattern}</option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Min Hook Score</label>
            <div className={styles.rangeWrapper}>
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                value={minHookScore}
                onChange={e => setMinHookScore(Number(e.target.value))}
                className={styles.rangeInput}
              />
              <span className={styles.rangeValue}>{minHookScore}%</span>
            </div>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Min Trend Score</label>
            <div className={styles.rangeWrapper}>
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                value={minTrendScore}
                onChange={e => setMinTrendScore(Number(e.target.value))}
                className={styles.rangeInput}
              />
              <span className={styles.rangeValue}>{minTrendScore}%</span>
            </div>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Sort By</label>
            <div className={styles.sortWrapper}>
              <select
                value={sortField}
                onChange={e => setSortField(e.target.value as SortField)}
                className={styles.filterSelect}
              >
                <option value="generatedAt">Date Generated</option>
                <option value="titleHookStrength">Hook Score</option>
                <option value="trendAlignment">Trend Score</option>
                <option value="controversyBalance">Debate Score</option>
                <option value="title">Title (A-Z)</option>
              </select>
              <button
                className={styles.sortDirBtn}
                onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
                title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortDirection === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className={styles.bulkActions}>
          <input
            type="checkbox"
            checked={selectedIds.size === filteredProposals.length && filteredProposals.length > 0}
            onChange={selectAllFiltered}
            className={styles.bulkCheckbox}
          />
          <span className={styles.selectedCount}>{selectedIds.size} selected</span>
          <Button onClick={handleBulkApprove} variant="primary" size="sm">
            Approve Selected
          </Button>
          <Button onClick={handleBulkReject} variant="secondary" size="sm">
            Reject Selected
          </Button>
          <button className={styles.clearSelectionBtn} onClick={() => setSelectedIds(new Set())}>
            Clear Selection
          </button>
        </div>
      )}

      {/* Proposals List */}
      {filteredProposals.length > 0 ? (
        viewMode === 'cards' ? (
          <div className={styles.proposalGrid}>
            {filteredProposals.map(proposal => (
              <article
                key={proposal.id}
                className={`${styles.proposalCard} ${styles[`status${proposal.status.charAt(0).toUpperCase()}${proposal.status.slice(1)}`]} ${selectedIds.has(proposal.id) ? styles.selected : ''}`}
              >
                <div className={styles.cardHeader}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(proposal.id)}
                    onChange={() => toggleSelection(proposal.id)}
                    className={styles.cardCheckbox}
                    onClick={e => e.stopPropagation()}
                  />
                  <span className={`${styles.statusBadge} ${styles[`badge${proposal.status.charAt(0).toUpperCase()}${proposal.status.slice(1)}`]}`}>
                    {proposal.status}
                  </span>
                  {proposal.wasEdited && <span className={styles.editedBadge}>Edited</span>}
                  {proposal.episodeNumber && (
                    <span className={styles.episodeNumber}>EP {proposal.episodeNumber}</span>
                  )}
                </div>

                <Link to={`/admin/duelogic/proposals/${proposal.id}`} className={styles.cardContent}>
                  <h3 className={styles.cardTitle}>{proposal.title}</h3>
                  <p className={styles.cardSubtitle}>{proposal.subtitle}</p>
                  <p className={styles.cardDescription}>{proposal.description}</p>

                  {/* Viral Metrics */}
                  {proposal.viralMetrics && (
                    <div className={styles.viralMetrics}>
                      <div className={styles.viralScores}>
                        <div className={`${styles.viralScore} ${getScoreClass(proposal.viralMetrics.titleHookStrength)}`}>
                          <span className={styles.scoreLabel}>Hook</span>
                          <span className={styles.scoreValue}>{Math.round(proposal.viralMetrics.titleHookStrength * 100)}%</span>
                        </div>
                        <div className={`${styles.viralScore} ${getScoreClass(proposal.viralMetrics.trendAlignment)}`}>
                          <span className={styles.scoreLabel}>Trend</span>
                          <span className={styles.scoreValue}>{Math.round(proposal.viralMetrics.trendAlignment * 100)}%</span>
                        </div>
                        <div className={`${styles.viralScore} ${getScoreClass(proposal.viralMetrics.controversyBalance)}`}>
                          <span className={styles.scoreLabel}>Debate</span>
                          <span className={styles.scoreValue}>{Math.round(proposal.viralMetrics.controversyBalance * 100)}%</span>
                        </div>
                      </div>
                      {proposal.viralMetrics.titlePattern && (
                        <span className={styles.titlePattern}>{proposal.viralMetrics.titlePattern}</span>
                      )}
                      {proposal.viralMetrics.suggestedHashtags && proposal.viralMetrics.suggestedHashtags.length > 0 && (
                        <div className={styles.hashtags}>
                          {proposal.viralMetrics.suggestedHashtags.slice(0, 4).map((tag, i) => (
                            <span key={i} className={styles.hashtag}>{tag}</span>
                          ))}
                        </div>
                      )}
                      {proposal.viralMetrics.targetAudience && (
                        <p className={styles.targetAudience}>
                          <strong>Target:</strong> {proposal.viralMetrics.targetAudience}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Meta Info */}
                  <div className={styles.cardMeta}>
                    <div className={styles.metaRow}>
                      <span className={styles.metaItem}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        {formatDate(proposal.generatedAt)}
                      </span>
                      {proposal.category && (
                        <span className={styles.categoryBadge}>
                          {CATEGORY_LABELS[proposal.category]}
                        </span>
                      )}
                    </div>
                    {proposal.researchResultId && (
                      <span className={styles.researchInfo}>
                        Research: {proposal.researchResultId.slice(0, 8)}...
                      </span>
                    )}
                  </div>
                </Link>

                {/* Quick Actions */}
                {proposal.status === 'pending' && (
                  <div className={styles.cardActions}>
                    <Button
                      onClick={(e) => handleQuickApprove(proposal.id, e)}
                      variant="primary"
                      size="sm"
                      className={styles.approveBtn}
                    >
                      Approve
                    </Button>
                    <Button
                      onClick={(e) => handleQuickReject(proposal.id, e)}
                      variant="secondary"
                      size="sm"
                      className={styles.rejectBtn}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          /* Compact Table View */
          <table className={styles.compactTable}>
            <thead>
              <tr>
                <th className={styles.checkCol}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredProposals.length && filteredProposals.length > 0}
                    onChange={selectAllFiltered}
                  />
                </th>
                <th>Title</th>
                <th>Status</th>
                <th>Hook</th>
                <th>Trend</th>
                <th>Debate</th>
                <th>Pattern</th>
                <th>Generated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProposals.map(proposal => (
                <tr key={proposal.id} className={selectedIds.has(proposal.id) ? styles.selectedRow : ''}>
                  <td className={styles.checkCol}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(proposal.id)}
                      onChange={() => toggleSelection(proposal.id)}
                    />
                  </td>
                  <td>
                    <Link to={`/admin/duelogic/proposals/${proposal.id}`} className={styles.titleLink}>
                      <strong>{proposal.title}</strong>
                      <span className={styles.subtitleSmall}>{proposal.subtitle}</span>
                    </Link>
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[`badge${proposal.status.charAt(0).toUpperCase()}${proposal.status.slice(1)}`]}`}>
                      {proposal.status}
                    </span>
                  </td>
                  <td className={getScoreClass(proposal.viralMetrics?.titleHookStrength || 0)}>
                    {proposal.viralMetrics ? `${Math.round(proposal.viralMetrics.titleHookStrength * 100)}%` : '-'}
                  </td>
                  <td className={getScoreClass(proposal.viralMetrics?.trendAlignment || 0)}>
                    {proposal.viralMetrics ? `${Math.round(proposal.viralMetrics.trendAlignment * 100)}%` : '-'}
                  </td>
                  <td className={getScoreClass(proposal.viralMetrics?.controversyBalance || 0)}>
                    {proposal.viralMetrics ? `${Math.round(proposal.viralMetrics.controversyBalance * 100)}%` : '-'}
                  </td>
                  <td>
                    {proposal.viralMetrics?.titlePattern && (
                      <span className={styles.patternBadge}>{proposal.viralMetrics.titlePattern}</span>
                    )}
                  </td>
                  <td className={styles.dateCell}>
                    {formatDate(proposal.generatedAt)}
                    <span className={styles.timeSmall}>{formatTime(proposal.generatedAt)}</span>
                  </td>
                  <td>
                    <div className={styles.tableActions}>
                      <Link to={`/admin/duelogic/proposals/${proposal.id}`} className={styles.viewLink}>
                        View
                      </Link>
                      {proposal.status === 'pending' && (
                        <>
                          <button onClick={(e) => handleQuickApprove(proposal.id, e)} className={styles.actionApprove}>✓</button>
                          <button onClick={(e) => handleQuickReject(proposal.id, e)} className={styles.actionReject}>✕</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <div className={styles.emptyState}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 12h6M12 9v6M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3>No proposals found</h3>
          <p>
            {hasActiveFilters
              ? 'Try adjusting your filters to see more results.'
              : 'Run a research job to generate episode proposals.'}
          </p>
          {hasActiveFilters && (
            <Button onClick={clearFilters} variant="secondary">Clear Filters</Button>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminDuelogicProposalsPage;
