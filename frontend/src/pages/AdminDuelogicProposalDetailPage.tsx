/**
 * AdminDuelogicProposalDetailPage
 *
 * Detailed view and edit page for an episode proposal
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button, Alert } from '../components/ui';
import styles from './AdminDuelogicProposalDetailPage.module.css';
import type { EpisodeProposal, PhilosophicalChair } from '../types/duelogic-research';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export function AdminDuelogicProposalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [proposal, setProposal] = useState<EpisodeProposal | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProposal, setEditedProposal] = useState<Partial<EpisodeProposal>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
        setActionMessage({ type: 'success', text: 'Proposal updated' });
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
        setActionMessage({ type: 'success', text: `Approved as Episode ${data.episodeNumber}` });
        fetchProposal();
      } else {
        setActionMessage({ type: 'error', text: 'Failed to approve proposal' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to approve proposal' });
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

  const updateField = (field: keyof EpisodeProposal, value: any) => {
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
    return new Date(dateStr).toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading proposal...</div>
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

      {/* Header */}
      <header className={styles.header}>
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
        <div className={styles.headerMeta}>
          <span className={`${styles.status} ${styles[`status${proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}`]}`}>
            {proposal.status}
          </span>
          {proposal.episodeNumber && (
            <span className={styles.episodeNumber}>Episode #{proposal.episodeNumber}</span>
          )}
        </div>
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
              <Button onClick={handleSchedule} variant="primary">
                Schedule
              </Button>
            )}
          </>
        )}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Description */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Description</h2>
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
        </section>

        {/* Proposition */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Proposition</h2>
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
        </section>

        {/* Context for Panel */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Context for Panel</h2>
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
        </section>

        {/* Philosophical Chairs */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Philosophical Chairs</h2>
          <div className={styles.chairsGrid}>
            {chairs.map((chair, index) => (
              <div key={index} className={styles.chairCard}>
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
                      <strong>Must acknowledge:</strong> {chair.mustAcknowledge}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Key Tensions */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Key Tensions</h2>
          <ul className={styles.tensionList}>
            {keyTensions.map((tension, index) => (
              <li key={index}>
                {isEditing ? (
                  <input
                    type="text"
                    value={tension || ''}
                    onChange={e => updateKeyTension(index, e.target.value)}
                    className={styles.tensionInput}
                    placeholder={`Tension ${index + 1}`}
                  />
                ) : (
                  tension
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Metadata */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Metadata</h2>
          <dl className={styles.metadataGrid}>
            <dt>Generated</dt>
            <dd>{formatDate(proposal.generatedAt)}</dd>
            {proposal.reviewedAt && (
              <>
                <dt>Reviewed</dt>
                <dd>{formatDate(proposal.reviewedAt)} by {proposal.reviewedBy}</dd>
              </>
            )}
            {proposal.scheduledFor && (
              <>
                <dt>Scheduled for</dt>
                <dd>{formatDate(proposal.scheduledFor)}</dd>
              </>
            )}
            {proposal.adminNotes && (
              <>
                <dt>Notes</dt>
                <dd>{proposal.adminNotes}</dd>
              </>
            )}
            <dt>Edited</dt>
            <dd>{proposal.wasEdited ? 'Yes' : 'No'}</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}

export default AdminDuelogicProposalDetailPage;
