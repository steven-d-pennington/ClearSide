/**
 * PersonaSelector Component
 *
 * Allows users to select debate personas for Pro and Con advocates.
 * Each persona brings a distinct argumentation style (Theorist, Politician,
 * Scientist, Lawyer, Economist, Ethicist).
 */

import React, { useState, useEffect } from 'react';
import type { PersonaSummary, PersonaSelection } from '../../types/configuration';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface PersonaSelectorProps {
  selection: PersonaSelection;
  onChange: (selection: PersonaSelection) => void;
  disabled?: boolean;
}

export const PersonaSelector: React.FC<PersonaSelectorProps> = ({
  selection,
  onChange,
  disabled = false,
}) => {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch personas on mount
  useEffect(() => {
    const fetchPersonas = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_URL}/api/personas`);
        if (!response.ok) {
          throw new Error('Failed to fetch personas');
        }
        const result = await response.json();
        if (result.success && Array.isArray(result.data)) {
          setPersonas(result.data);
        } else {
          throw new Error('Invalid response format');
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load personas');
        // Set default personas as fallback
        setPersonas([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPersonas();
  }, []);

  const handleProChange = (personaId: string | null) => {
    onChange({
      ...selection,
      proPersonaId: personaId,
    });
  };

  const handleConChange = (personaId: string | null) => {
    onChange({
      ...selection,
      conPersonaId: personaId,
    });
  };

  const getPersonaById = (id: string | null): PersonaSummary | null => {
    if (!id) return null;
    return personas.find((p) => p.id === id) || null;
  };

  const proPersona = getPersonaById(selection.proPersonaId);
  const conPersona = getPersonaById(selection.conPersonaId);

  // Summary display when collapsed
  const getSummaryText = () => {
    if (!proPersona && !conPersona) {
      return 'Standard advocates (no personas selected)';
    }
    const parts = [];
    if (proPersona) {
      parts.push(`Pro: ${proPersona.avatarEmoji || ''} ${proPersona.name}`);
    }
    if (conPersona) {
      parts.push(`Con: ${conPersona.avatarEmoji || ''} ${conPersona.name}`);
    }
    return parts.join(' | ');
  };

  if (loading) {
    return (
      <div className="persona-selector">
        <div className="persona-selector-header">
          <span className="persona-selector-title">Debate Personas</span>
          <span className="persona-selector-loading">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="persona-selector persona-selector-error">
        <div className="persona-selector-header">
          <span className="persona-selector-title">Debate Personas</span>
          <span className="persona-selector-error-text">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`persona-selector ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <button
        type="button"
        className="persona-selector-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={disabled}
      >
        <span className="persona-selector-title">Debate Personas</span>
        <span className="persona-selector-summary">{getSummaryText()}</span>
        <span className="persona-selector-chevron">{isExpanded ? '▼' : '▶'}</span>
      </button>

      {isExpanded && (
        <div className="persona-selector-content">
          <p className="persona-selector-description">
            Choose distinct argumentation styles for each advocate. Each persona brings
            a unique perspective and vocabulary to the debate.
          </p>

          <div className="persona-selector-sides">
            {/* Pro Advocate Selection */}
            <div className="persona-side pro-side">
              <h4 className="persona-side-title">
                <span className="side-indicator pro">PRO</span> Advocate Persona
              </h4>
              <div className="persona-grid">
                <PersonaOption
                  persona={null}
                  isSelected={selection.proPersonaId === null}
                  onSelect={() => handleProChange(null)}
                  disabled={disabled}
                  side="pro"
                />
                {personas.map((persona) => (
                  <PersonaOption
                    key={persona.id}
                    persona={persona}
                    isSelected={selection.proPersonaId === persona.id}
                    onSelect={() => handleProChange(persona.id)}
                    disabled={disabled}
                    side="pro"
                  />
                ))}
              </div>
            </div>

            {/* Con Advocate Selection */}
            <div className="persona-side con-side">
              <h4 className="persona-side-title">
                <span className="side-indicator con">CON</span> Advocate Persona
              </h4>
              <div className="persona-grid">
                <PersonaOption
                  persona={null}
                  isSelected={selection.conPersonaId === null}
                  onSelect={() => handleConChange(null)}
                  disabled={disabled}
                  side="con"
                />
                {personas.map((persona) => (
                  <PersonaOption
                    key={persona.id}
                    persona={persona}
                    isSelected={selection.conPersonaId === persona.id}
                    onSelect={() => handleConChange(persona.id)}
                    disabled={disabled}
                    side="con"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .persona-selector {
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 8px;
          background: var(--bg-secondary, #f9fafb);
          margin-bottom: 1rem;
        }

        .persona-selector-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
        }

        .persona-selector-toggle:hover:not(:disabled) {
          background: var(--bg-hover, rgba(0, 0, 0, 0.05));
        }

        .persona-selector-toggle:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .persona-selector-title {
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        .persona-selector-summary {
          flex: 1;
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
        }

        .persona-selector-chevron {
          color: var(--text-tertiary, #9ca3af);
          font-size: 0.75rem;
        }

        .persona-selector-content {
          padding: 0 1rem 1rem;
          border-top: 1px solid var(--border-color, #e5e7eb);
        }

        .persona-selector-description {
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
          margin: 0.75rem 0 1rem;
        }

        .persona-selector-sides {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }

        @media (max-width: 768px) {
          .persona-selector-sides {
            grid-template-columns: 1fr;
          }
        }

        .persona-side-title {
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .side-indicator {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .side-indicator.pro {
          background: #10b981;
          color: white;
        }

        .side-indicator.con {
          background: #f59e0b;
          color: white;
        }

        .persona-grid {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .persona-option {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0.75rem;
          border: 2px solid transparent;
          border-radius: 6px;
          cursor: pointer;
          background: var(--bg-primary, white);
          transition: all 0.15s ease;
        }

        .persona-option:hover:not(.disabled) {
          border-color: var(--border-hover, #d1d5db);
        }

        .persona-option.selected {
          border-color: var(--color-primary, #3b82f6);
          background: var(--bg-selected, #eff6ff);
        }

        .persona-option.selected.pro {
          border-color: #10b981;
          background: #ecfdf5;
        }

        .persona-option.selected.con {
          border-color: #f59e0b;
          background: #fffbeb;
        }

        .persona-option.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .persona-emoji {
          font-size: 1.5rem;
          min-width: 2rem;
          text-align: center;
        }

        .persona-info {
          flex: 1;
          min-width: 0;
        }

        .persona-name {
          font-weight: 500;
          color: var(--text-primary, #111827);
          font-size: 0.875rem;
        }

        .persona-description {
          font-size: 0.75rem;
          color: var(--text-secondary, #6b7280);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .persona-selector-loading,
        .persona-selector-error-text {
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
        }

        .persona-selector-error .persona-selector-error-text {
          color: #dc2626;
        }
      `}</style>
    </div>
  );
};

/**
 * Individual persona option button
 */
interface PersonaOptionProps {
  persona: PersonaSummary | null;
  isSelected: boolean;
  onSelect: () => void;
  disabled: boolean;
  side: 'pro' | 'con';
}

const PersonaOption: React.FC<PersonaOptionProps> = ({
  persona,
  isSelected,
  onSelect,
  disabled,
  side,
}) => {
  const classNames = [
    'persona-option',
    isSelected ? 'selected' : '',
    isSelected ? side : '',
    disabled ? 'disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (!persona) {
    return (
      <button
        type="button"
        className={classNames}
        onClick={onSelect}
        disabled={disabled}
      >
        <span className="persona-emoji">👤</span>
        <div className="persona-info">
          <span className="persona-name">Standard Advocate</span>
          <span className="persona-description">Default balanced argumentation style</span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={classNames}
      onClick={onSelect}
      disabled={disabled}
      style={
        isSelected && persona.colorPrimary
          ? { borderColor: persona.colorPrimary, backgroundColor: `${persona.colorPrimary}10` }
          : undefined
      }
    >
      <span className="persona-emoji">{persona.avatarEmoji || '👤'}</span>
      <div className="persona-info">
        <span className="persona-name">{persona.name}</span>
        <span className="persona-description">{persona.description || persona.archetype}</span>
      </div>
    </button>
  );
};

export default PersonaSelector;
