/**
 * AdminConfigPage
 *
 * Configuration management page for presets, personas, and system settings.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../components/ui';
import styles from './AdminConfigPage.module.css';

interface Preset {
  id: string;
  name: string;
  description: string;
  brevityLevel: number;
  llmTemperature: number;
  maxTokensPerResponse: number;
  requireCitations: boolean;
  isDefault?: boolean;
}

interface Persona {
  id: string;
  name: string;
  description: string;
  argumentationStyle: string;
  rhetoricalApproach: string;
  evidencePreference: string;
  systemPromptAdditions?: string;
  createdAt: string;
}

interface TTSProvider {
  id: string;
  name: string;
  available: boolean;
  envVar?: string;
}

export function AdminConfigPage() {
  const [activeTab, setActiveTab] = useState<'presets' | 'personas' | 'providers'>('presets');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [providers, setProviders] = useState<TTSProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [actionMessage, _setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  const fetchPresets = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/config/presets`);
      if (!response.ok) throw new Error('Failed to fetch presets');
      const data = await response.json();
      setPresets(data.presets || []);
    } catch (err) {
      console.error('Error fetching presets:', err);
    }
  }, [API_BASE_URL]);

  const fetchPersonas = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/personas`);
      if (!response.ok) throw new Error('Failed to fetch personas');
      const data = await response.json();
      setPersonas(data.personas || []);
    } catch (err) {
      console.error('Error fetching personas:', err);
    }
  }, [API_BASE_URL]);

  const fetchProviders = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/exports/audio/providers`);
      if (!response.ok) throw new Error('Failed to fetch providers');
      const data = await response.json();
      setProviders(data.providers || []);
    } catch (err) {
      console.error('Error fetching providers:', err);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      try {
        await Promise.all([fetchPresets(), fetchPersonas(), fetchProviders()]);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load configuration');
      } finally {
        setIsLoading(false);
      }
    };
    fetchAll();
  }, [fetchPresets, fetchPersonas, fetchProviders]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link to="/admin" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>Configuration</h1>
        <p className={styles.subtitle}>Manage presets, personas, and system settings</p>
      </header>

      {actionMessage && (
        <Alert variant={actionMessage.type} className={styles.actionAlert}>
          {actionMessage.text}
        </Alert>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'presets' ? styles.active : ''}`}
          onClick={() => setActiveTab('presets')}
        >
          Presets ({presets.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'personas' ? styles.active : ''}`}
          onClick={() => setActiveTab('personas')}
        >
          Personas ({personas.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'providers' ? styles.active : ''}`}
          onClick={() => setActiveTab('providers')}
        >
          TTS Providers ({providers.length})
        </button>
      </div>

      {/* Presets Tab */}
      {activeTab === 'presets' && (
        <div className={styles.tabContent}>
          <div className={styles.tabHeader}>
            <h2>Debate Presets</h2>
            <p className={styles.tabDescription}>
              Presets define default configurations for new debates.
            </p>
          </div>

          {presets.length === 0 ? (
            <div className={styles.noData}>No presets configured</div>
          ) : (
            <div className={styles.cardGrid}>
              {presets.map((preset) => (
                <div key={preset.id} className={styles.presetCard}>
                  <div className={styles.presetHeader}>
                    <h3 className={styles.presetName}>
                      {preset.name}
                      {preset.isDefault && <span className={styles.defaultBadge}>Default</span>}
                    </h3>
                  </div>
                  <p className={styles.presetDescription}>{preset.description}</p>
                  <div className={styles.presetDetails}>
                    <div className={styles.presetDetail}>
                      <span className={styles.detailLabel}>Brevity</span>
                      <span className={styles.detailValue}>{preset.brevityLevel}/5</span>
                    </div>
                    <div className={styles.presetDetail}>
                      <span className={styles.detailLabel}>Temperature</span>
                      <span className={styles.detailValue}>{preset.llmTemperature}</span>
                    </div>
                    <div className={styles.presetDetail}>
                      <span className={styles.detailLabel}>Max Tokens</span>
                      <span className={styles.detailValue}>{preset.maxTokensPerResponse}</span>
                    </div>
                    <div className={styles.presetDetail}>
                      <span className={styles.detailLabel}>Citations</span>
                      <span className={styles.detailValue}>
                        {preset.requireCitations ? 'Required' : 'Optional'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Personas Tab */}
      {activeTab === 'personas' && (
        <div className={styles.tabContent}>
          <div className={styles.tabHeader}>
            <h2>Debate Personas</h2>
            <p className={styles.tabDescription}>
              Personas define argumentation styles for debate advocates.
            </p>
          </div>

          {personas.length === 0 ? (
            <div className={styles.noData}>No personas configured</div>
          ) : (
            <div className={styles.cardGrid}>
              {personas.map((persona) => (
                <div key={persona.id} className={styles.personaCard}>
                  <h3 className={styles.personaName}>{persona.name}</h3>
                  <p className={styles.personaDescription}>{persona.description}</p>
                  <div className={styles.personaDetails}>
                    <div className={styles.personaDetail}>
                      <span className={styles.detailLabel}>Style</span>
                      <span className={styles.detailValue}>{persona.argumentationStyle}</span>
                    </div>
                    <div className={styles.personaDetail}>
                      <span className={styles.detailLabel}>Approach</span>
                      <span className={styles.detailValue}>{persona.rhetoricalApproach}</span>
                    </div>
                    <div className={styles.personaDetail}>
                      <span className={styles.detailLabel}>Evidence</span>
                      <span className={styles.detailValue}>{persona.evidencePreference}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Providers Tab */}
      {activeTab === 'providers' && (
        <div className={styles.tabContent}>
          <div className={styles.tabHeader}>
            <h2>TTS Providers</h2>
            <p className={styles.tabDescription}>
              Text-to-speech providers for audio export. Configure API keys in environment variables.
            </p>
          </div>

          {providers.length === 0 ? (
            <div className={styles.noData}>No TTS providers available</div>
          ) : (
            <div className={styles.providerList}>
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className={`${styles.providerCard} ${provider.available ? styles.available : styles.unavailable}`}
                >
                  <div className={styles.providerHeader}>
                    <h3 className={styles.providerName}>{provider.name}</h3>
                    <span className={`${styles.providerStatus} ${provider.available ? styles.statusAvailable : styles.statusUnavailable}`}>
                      {provider.available ? 'Available' : 'Not Configured'}
                    </span>
                  </div>
                  {provider.envVar && !provider.available && (
                    <p className={styles.providerHint}>
                      Set <code>{provider.envVar}</code> environment variable to enable
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminConfigPage;
