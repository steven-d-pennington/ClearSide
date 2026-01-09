/**
 * AdminDuelogicProposalDetailPage
 *
 * Detailed view and edit page for an episode proposal
 * Design: Command Center Editorial - Proposal Deep Dive
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button, Alert } from '../components/ui';
import { LaunchDebateModal } from '../components/LaunchDebateModal';
import styles from './AdminDuelogicProposalDetailPage.module.css';
import type { EpisodeProposal, PhilosophicalChair } from '../types/duelogic-research';
import { CATEGORY_LABELS, type ResearchCategory } from '../types/duelogic-research';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Helper to get score class
const getScoreClass = (score: number): string => {
  if (score >= 0.6) return styles.scoreHigh;
  if (score >= 0.3) return styles.scoreMedium;
  return styles.scoreLow;
};

export function AdminDuelogicProposalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [proposal, setProposal] = useState<EpisodeProposal | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProposal, setEditedProposal] = useState<Partial<EpisodeProposal>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isRelaunching, setIsRelaunching] = useState(false);

  const fetchProposal = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/${id}`);
      if (!response.ok) throw new Error('Failed to fetch proposal');
      const data = await response.json();
      setProposal(data);
      setEditedProposal(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching proposal:', err);
      setError(err instanceof Error ? err.message : 'Failed to load proposal');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProposal();
  }, [fetchProposal]);

  const handleSave = async () => {
    if (!id) return;
    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedProposal),
      });

      if (response.ok) {
        setActionMessage({ type: 'success', text: 'Proposal updated successfully' });
        setIsEditing(false);
        fetchProposal();
      } else {
        setActionMessage({ type: 'error', text: 'Failed to update proposal' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to update proposal' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleApprove = async () => {
    if (!id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        setActionMessage({ type: 'success', text: `Approved as Episode #${data.episodeNumber}` });
        fetchProposal();
      } else {
        setActionMessage({ type: 'error', text: 'Failed to approve proposal' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to approve proposal' });
    }
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleUnapprove = async () => {
    if (!id) return;
    if (!confirm('Are you sure you want to unapprove this proposal? It will return to pending status.')) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/${id}/unapprove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        setActionMessage({ type: 'success', text: 'Proposal returned to pending' });
        fetchProposal();
      } else {
        setActionMessage({ type: 'error', text: 'Failed to unapprove proposal' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to unapprove proposal' });
    }
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleReject = async () => {
    if (!id) return;
    const notes = prompt('Rejection notes (optional):');
    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });

      if (response.ok) {
        setActionMessage({ type: 'success', text: 'Proposal rejected' });
        fetchProposal();
      } else {
        setActionMessage({ type: 'error', text: 'Failed to reject proposal' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to reject proposal' });
    }
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleSchedule = async () => {
    if (!id) return;
    const dateStr = prompt('Schedule for (YYYY-MM-DD):');
    if (!dateStr) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/${id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledFor: dateStr }),
      });

      if (response.ok) {
        setActionMessage({ type: 'success', text: `Scheduled for ${dateStr}` });
        fetchProposal();
      } else {
        setActionMessage({ type: 'error', text: 'Failed to schedule proposal' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to schedule proposal' });
    }
    setTimeout(() => setActionMessage(null), 5000);
  };

  interface ChairModelSelection {
    modelId: string;
    modelDisplayName: string;
    providerName: string;
  }

  interface LaunchDebateOptions {
    chairModels: ChairModelSelection[];
    allowInterruptions: boolean;
  }

  const handleLaunchDebate = async (options: LaunchDebateOptions) => {
    if (!id) return;

    setIsLaunching(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/${id}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chairModels: options.chairModels,
          allowInterruptions: options.allowInterruptions,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setShowLaunchModal(false);
        setActionMessage({
          type: 'success',
          text: `Debate launched! ID: ${data.debateId.slice(0, 8)}...`,
        });
        fetchProposal();
      } else {
        const data = await response.json();
        setActionMessage({ type: 'error', text: data.error || 'Failed to launch debate' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to launch debate' });
    } finally {
      setIsLaunching(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleRelaunch = async () => {
    if (!id) return;

    if (!confirm('This will delete the previous debate data and allow you to launch again with different models. Continue?')) {
      return;
    }

    setIsRelaunching(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/${id}/relaunch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        let message = 'Proposal reset for re-launch.';
        if (data.failedChairInfo) {
          message += ` Previous failure: ${data.failedChairInfo.modelDisplayName || data.failedChairInfo.modelId} (${data.failedChairInfo.position})`;
        }
        setActionMessage({ type: 'success', text: message });
        fetchProposal();
      } else {
        const data = await response.json();
        setActionMessage({ type: 'error', text: data.error || 'Failed to reset proposal' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to reset proposal' });
    } finally {
      setIsRelaunching(false);
      setTimeout(() => setActionMessage(null), 7000);
    }
  };

  const updateField = (field: keyof EpisodeProposal, value: unknown) => {
    setEditedProposal(prev => ({ ...prev, [field]: value }));
  };

  const updateChair = (index: number, field: keyof PhilosophicalChair, value: string) => {
    const chairs = [...(editedProposal.chairs || proposal?.chairs || [])];
    chairs[index] = { ...chairs[index], [field]: value };
    setEditedProposal(prev => ({ ...prev, chairs }));
  };

  const updateKeyTension = (index: number, value: string) => {
    const keyTensions = [...(editedProposal.keyTensions || proposal?.keyTensions || [])];
    keyTensions[index] = value;
    setEditedProposal(prev => ({ ...prev, keyTensions }));
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.loadingSpinner} />
          <span>Loading proposal...</span>
        </div>
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className={styles.container}>
        <Alert variant="error">{error || 'Proposal not found'}</Alert>
        <Button onClick={() => navigate('/admin/duelogic/proposals')} className={styles.backBtn}>
          Back to Proposals
        </Button>
      </div>
    );
  }

  const displayProposal = isEditing ? editedProposal : proposal;
  const chairs = displayProposal.chairs || [];
  const keyTensions = displayProposal.keyTensions || [];
  const viralMetrics = proposal.viralMetrics;
  const statusClass = `status${proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}`;

  return (
    <div className={styles.container}>
      <Link to="/admin/duelogic/proposals" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Proposals
      </Link>

      {actionMessage && (
        <Alert variant={actionMessage.type} className={styles.actionAlert}>
          {actionMessage.text}
        </Alert>
      )}

      {/* Hero Header */}
      <header className={`${styles.header} ${styles[statusClass]}`}>
        <div className={styles.headerTop}>
          <div className={styles.headerMeta}>
            <span className={`${styles.status} ${styles[statusClass]}`}>
              {proposal.status}
            </span>
            {proposal.episodeNumber && (
              <span className={styles.episodeNumber}>EP #{proposal.episodeNumber}</span>
            )}
            {proposal.category && (
              <span className={styles.categoryBadge}>
                {CATEGORY_LABELS[proposal.category as ResearchCategory] || proposal.category}
              </span>
            )}
          </div>
        </div>

        <div className={styles.headerContent}>
          {isEditing ? (
            <>
              <input
                type="text"
                value={displayProposal.title || ''}
                onChange={e => updateField('title', e.target.value)}
                className={styles.titleInput}
                placeholder="Episode Title"
              />
              <input
                type="text"
                value={displayProposal.subtitle || ''}
                onChange={e => updateField('subtitle', e.target.value)}
                className={styles.subtitleInput}
                placeholder="Episode Subtitle"
              />
            </>
          ) : (
            <>
              <h1 className={styles.title}>{proposal.title}</h1>
              <p className={styles.subtitle}>{proposal.subtitle}</p>
            </>
          )}
        </div>

        {/* Viral Metrics Panel */}
        {viralMetrics && (
          <div className={styles.viralPanel}>
            <div className={`${styles.viralScore} ${getScoreClass(viralMetrics.titleHookStrength)}`}>
              <span className={styles.scoreLabel}>Hook</span>
              <span className={styles.scoreValue}>{Math.round(viralMetrics.titleHookStrength * 100)}%</span>
            </div>
            <div className={`${styles.viralScore} ${getScoreClass(viralMetrics.trendAlignment)}`}>
              <span className={styles.scoreLabel}>Trend</span>
              <span className={styles.scoreValue}>{Math.round(viralMetrics.trendAlignment * 100)}%</span>
            </div>
            <div className={`${styles.viralScore} ${getScoreClass(viralMetrics.controversyBalance)}`}>
              <span className={styles.scoreLabel}>Debate</span>
              <span className={styles.scoreValue}>{Math.round(viralMetrics.controversyBalance * 100)}%</span>
            </div>
            {viralMetrics.matchedTrends && viralMetrics.matchedTrends.length > 0 && (
              <div className={styles.matchedTrends}>
                <div className={styles.trendsLabel}>Matched Trends</div>
                <div className={styles.trendsList}>
                  {viralMetrics.matchedTrends.map((trend, i) => (
                    <span key={i} className={styles.trendTag}>{trend}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Actions */}
      <div className={styles.actions}>
        {isEditing ? (
          <>
            <Button onClick={handleSave} variant="primary" loading={isSaving}>
              Save Changes
            </Button>
            <Button onClick={() => { setIsEditing(false); setEditedProposal(proposal); }} variant="secondary">
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setIsEditing(true)} variant="secondary">
              Edit
            </Button>
            {proposal.status === 'pending' && (
              <>
                <Button onClick={handleApprove} variant="primary">
                  Approve
                </Button>
                <Button onClick={handleReject} variant="secondary">
                  Reject
                </Button>
              </>
            )}
            {proposal.status === 'approved' && (
              <>
                <Button onClick={() => setShowLaunchModal(true)} variant="primary">
                  Launch Debate
                </Button>
                <Button onClick={handleSchedule} variant="secondary">
                  Schedule
                </Button>
                <Button onClick={handleUnapprove} variant="secondary">
                  Unapprove
                </Button>
              </>
            )}
            {proposal.status === 'scheduled' && (
              <>
                <Button onClick={() => setShowLaunchModal(true)} variant="primary">
                  Launch Debate
                </Button>
                <Button onClick={handleUnapprove} variant="secondary">
                  Unapprove
                </Button>
              </>
            )}
            {proposal.status === 'launched' && (
              <>
                {proposal.launchedDebateId ? (
                  <Link to={`/debate/${proposal.launchedDebateId}`} className={styles.launchedLink}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    View Debate
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </Link>
                ) : (
                  <span className={styles.launchedBadge}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    Debate Launched
                  </span>
                )}
                <Button
                  onClick={handleRelaunch}
                  variant="secondary"
                  loading={isRelaunching}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 4v6h-6" />
                    <path d="M1 20v-6h6" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  Re-Launch
                </Button>
              </>
            )}
          </>
        )}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Description */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <h2 className={styles.sectionTitle}>Description</h2>
          </div>
          <div className={styles.sectionBody}>
            {isEditing ? (
              <textarea
                value={displayProposal.description || ''}
                onChange={e => updateField('description', e.target.value)}
                className={styles.textarea}
                rows={4}
                placeholder="Episode description"
              />
            ) : (
              <p className={styles.description}>{proposal.description}</p>
            )}
          </div>
        </section>

        {/* Proposition */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>
            <h2 className={styles.sectionTitle}>Proposition</h2>
          </div>
          <div className={styles.sectionBody}>
            {isEditing ? (
              <textarea
                value={displayProposal.proposition || ''}
                onChange={e => updateField('proposition', e.target.value)}
                className={styles.textarea}
                rows={2}
                placeholder="The debate proposition"
              />
            ) : (
              <blockquote className={styles.proposition}>{proposal.proposition}</blockquote>
            )}
          </div>
        </section>

        {/* Context for Panel */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <h2 className={styles.sectionTitle}>Context for Panel</h2>
          </div>
          <div className={styles.sectionBody}>
            {isEditing ? (
              <textarea
                value={displayProposal.contextForPanel || ''}
                onChange={e => updateField('contextForPanel', e.target.value)}
                className={styles.textarea}
                rows={6}
                placeholder="Background context for AI debaters"
              />
            ) : (
              <p className={styles.contextForPanel}>{proposal.contextForPanel}</p>
            )}
          </div>
        </section>

        {/* Philosophical Chairs */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h2 className={styles.sectionTitle}>Philosophical Chairs</h2>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.chairsGrid}>
              {chairs.map((chair, index) => (
                <div key={index} className={styles.chairCard}>
                  <span className={styles.chairLabel}>
                    {index === 0 ? 'Chair A' : 'Chair B'}
                  </span>
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        value={chair.name || ''}
                        onChange={e => updateChair(index, 'name', e.target.value)}
                        className={styles.input}
                        placeholder="Chair name"
                      />
                      <textarea
                        value={chair.position || ''}
                        onChange={e => updateChair(index, 'position', e.target.value)}
                        className={styles.textareaSmall}
                        rows={3}
                        placeholder="Chair position"
                      />
                      <textarea
                        value={chair.mustAcknowledge || ''}
                        onChange={e => updateChair(index, 'mustAcknowledge', e.target.value)}
                        className={styles.textareaSmall}
                        rows={2}
                        placeholder="Must acknowledge"
                      />
                    </>
                  ) : (
                    <>
                      <h3 className={styles.chairName}>{chair.name}</h3>
                      <p className={styles.chairPosition}>{chair.position}</p>
                      <p className={styles.chairAcknowledge}>
                        <strong>Must Acknowledge</strong>
                        {chair.mustAcknowledge}
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key Tensions */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <h2 className={styles.sectionTitle}>Key Tensions</h2>
          </div>
          <div className={styles.sectionBody}>
            <ul className={styles.tensionList}>
              {keyTensions.map((tension, index) => (
                <li key={index} className={styles.tensionItem}>
                  <span className={styles.tensionNumber}>{index + 1}</span>
                  {isEditing ? (
                    <input
                      type="text"
                      value={tension || ''}
                      onChange={e => updateKeyTension(index, e.target.value)}
                      className={styles.tensionInput}
                      placeholder={`Tension ${index + 1}`}
                    />
                  ) : (
                    <span className={styles.tensionText}>{tension}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Viral Optimization Details */}
        {viralMetrics && (viralMetrics.suggestedHashtags?.length > 0 || viralMetrics.targetAudience) && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <h2 className={styles.sectionTitle}>Viral Optimization</h2>
            </div>
            <div className={styles.sectionBody}>
              {viralMetrics.suggestedHashtags && viralMetrics.suggestedHashtags.length > 0 && (
                <div className={styles.hashtagsSection}>
                  <span className={styles.hashtagLabel}>Suggested Hashtags</span>
                  {viralMetrics.suggestedHashtags.map((tag, i) => (
                    <span key={i} className={styles.hashtag}>{tag}</span>
                  ))}
                </div>
              )}
              {viralMetrics.targetAudience && (
                <div className={styles.audienceSection}>
                  <span className={styles.audienceLabel}>Target Audience</span>
                  <p className={styles.audienceText}>{viralMetrics.targetAudience}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Metadata */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <h2 className={styles.sectionTitle}>Metadata</h2>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.metadataGrid}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Generated</span>
                <span className={styles.metaValue}>
                  {formatDate(proposal.generatedAt)}
                  {formatTime(proposal.generatedAt) && (
                    <span style={{ opacity: 0.6, marginLeft: '0.5rem' }}>
                      {formatTime(proposal.generatedAt)}
                    </span>
                  )}
                </span>
              </div>
              {proposal.reviewedAt && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Reviewed</span>
                  <span className={styles.metaValue}>
                    {formatDate(proposal.reviewedAt)}
                    {proposal.reviewedBy && (
                      <span style={{ opacity: 0.6, marginLeft: '0.5rem' }}>
                        by {proposal.reviewedBy}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {proposal.scheduledFor && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Scheduled For</span>
                  <span className={styles.metaValue}>{formatDate(proposal.scheduledFor)}</span>
                </div>
              )}
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Edited</span>
                <span className={styles.metaValue}>{proposal.wasEdited ? 'Yes' : 'No'}</span>
              </div>
              {viralMetrics?.titlePattern && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Title Pattern</span>
                  <span className={styles.metaValue}>{viralMetrics.titlePattern}</span>
                </div>
              )}
              {proposal.adminNotes && (
                <div className={styles.metaItem} style={{ gridColumn: '1 / -1' }}>
                  <span className={styles.metaLabel}>Admin Notes</span>
                  <span className={styles.metaValue}>{proposal.adminNotes}</span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Launch Debate Modal */}
      <LaunchDebateModal
        proposal={proposal}
        isOpen={showLaunchModal}
        onClose={() => setShowLaunchModal(false)}
        onLaunch={handleLaunchDebate}
        isLaunching={isLaunching}
      />
    </div>
  );
}

export default AdminDuelogicProposalDetailPage;
