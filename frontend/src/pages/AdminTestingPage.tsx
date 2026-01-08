/**
 * AdminTestingPage
 *
 * Tools for validating external service connectivity and credentials.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button } from '../components/ui';
import styles from './AdminTestingPage.module.css';

type ExternalServiceId =
  | 'elevenlabs'
  | 'gemini-tts'
  | 'google-cloud-tts'
  | 'google-cloud-long'
  | 'azure-tts'
  | 'edge-tts'
  | 'openrouter'
  | 'openai'
  | 'pinecone'
  | 'listen-notes';

interface ExternalServiceInfo {
  id: ExternalServiceId;
  name: string;
  category: 'tts' | 'llm' | 'research' | 'vector';
  description: string;
  configured: boolean;
  keyPreview?: string | null;
  metadata?: Record<string, string | null>;
  warning?: string | null;
}

interface ExternalServiceTestResult {
  success: boolean;
  message: string;
  durationMs: number;
  details?: Record<string, unknown>;
  checks?: Array<{ name: string; success: boolean; message: string }>;
}

interface ServiceFieldConfig {
  id: string;
  label: string;
  type: 'text' | 'textarea';
  placeholder?: string;
  helper?: string;
}

const SERVICE_FIELDS: Record<ExternalServiceId, ServiceFieldConfig[]> = {
  elevenlabs: [
    { id: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Paste ElevenLabs API key' },
  ],
  'gemini-tts': [
    { id: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Paste Google AI API key' },
  ],
  'google-cloud-tts': [
    { id: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Paste Google Cloud TTS API key' },
  ],
  'google-cloud-long': [
    {
      id: 'serviceAccountJson',
      label: 'Service Account JSON',
      type: 'textarea',
      placeholder: 'Paste service account JSON or a file path',
      helper: 'Supports JSON string or path to JSON file.',
    },
    { id: 'bucket', label: 'GCS Bucket', type: 'text', placeholder: 'tts-output-bucket' },
    { id: 'projectId', label: 'Project ID (optional)', type: 'text', placeholder: 'my-project-id' },
    { id: 'location', label: 'Location (optional)', type: 'text', placeholder: 'us-central1' },
  ],
  'azure-tts': [
    { id: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Paste Azure Speech key' },
    { id: 'region', label: 'Region', type: 'text', placeholder: 'eastus' },
  ],
  'edge-tts': [],
  openrouter: [
    { id: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Paste OpenRouter API key' },
  ],
  openai: [
    { id: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Paste OpenAI API key' },
  ],
  pinecone: [
    { id: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Paste Pinecone API key' },
    { id: 'indexName', label: 'Index Name', type: 'text', placeholder: 'duelogic-index' },
    { id: 'namespace', label: 'Namespace (optional)', type: 'text', placeholder: 'duelogic-research' },
  ],
  'listen-notes': [
    { id: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Paste Listen Notes API key' },
  ],
};

export function AdminTestingPage() {
  const [services, setServices] = useState<ExternalServiceInfo[]>([]);
  const [formState, setFormState] = useState<Record<string, Record<string, string>>>({});
  const [results, setResults] = useState<Record<string, ExternalServiceTestResult | null>>({});
  const [loadingService, setLoadingService] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  const fetchServices = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/testing/services`);
      if (!response.ok) throw new Error('Failed to fetch service list');
      const data = await response.json();
      setServices(data.services || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching service list:', err);
      setError(err instanceof Error ? err.message : 'Failed to load services');
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const handleFieldChange = (serviceId: ExternalServiceId, fieldId: string, value: string) => {
    setFormState((prev) => ({
      ...prev,
      [serviceId]: {
        ...(prev[serviceId] || {}),
        [fieldId]: value,
      },
    }));
  };

  const handleTest = async (serviceId: ExternalServiceId) => {
    setLoadingService((prev) => ({ ...prev, [serviceId]: true }));
    setResults((prev) => ({ ...prev, [serviceId]: null }));

    try {
      const fields = formState[serviceId] || {};
      const payload = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value && value.trim().length > 0)
      );

      const response = await fetch(`${API_BASE_URL}/api/admin/testing/services/${serviceId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Service test failed');
      }

      setResults((prev) => ({ ...prev, [serviceId]: data }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [serviceId]: {
          success: false,
          message: err instanceof Error ? err.message : 'Service test failed',
          durationMs: 0,
        },
      }));
    } finally {
      setLoadingService((prev) => ({ ...prev, [serviceId]: false }));
    }
  };

  const serviceGroups = useMemo(() => {
    return services.reduce<Record<string, ExternalServiceInfo[]>>((acc, service) => {
      if (!acc[service.category]) acc[service.category] = [];
      acc[service.category].push(service);
      return acc;
    }, {});
  }, [services]);

  const renderFields = (serviceId: ExternalServiceId) => {
    const fields = SERVICE_FIELDS[serviceId] || [];
    if (fields.length === 0) {
      return <div className={styles.fieldEmpty}>No credentials required for this service.</div>;
    }

    return fields.map((field) => (
      <label key={field.id} className={styles.field}>
        <span className={styles.fieldLabel}>{field.label}</span>
        {field.type === 'textarea' ? (
          <textarea
            value={formState[serviceId]?.[field.id] || ''}
            placeholder={field.placeholder}
            onChange={(event) => handleFieldChange(serviceId, field.id, event.target.value)}
            className={styles.textarea}
            rows={4}
          />
        ) : (
          <input
            type="text"
            value={formState[serviceId]?.[field.id] || ''}
            placeholder={field.placeholder}
            onChange={(event) => handleFieldChange(serviceId, field.id, event.target.value)}
            className={styles.input}
          />
        )}
        {field.helper && <span className={styles.fieldHelper}>{field.helper}</span>}
      </label>
    ));
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading external service tests...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <Alert variant="error">{error}</Alert>
        <Button onClick={fetchServices}>Retry</Button>
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
        <div>
          <h1 className={styles.title}>Admin Testing</h1>
          <p className={styles.subtitle}>
            Verify external service connectivity and try manual credentials without deploying changes.
          </p>
        </div>
        <Button variant="ghost" onClick={fetchServices}>
          Refresh
        </Button>
      </header>

      {Object.entries(serviceGroups).map(([category, items]) => (
        <section key={category} className={styles.section}>
          <h2 className={styles.sectionTitle}>{category.toUpperCase()} Services</h2>
          <div className={styles.serviceGrid}>
            {items.map((service) => {
              const result = results[service.id];
              return (
                <div key={service.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <h3 className={styles.cardTitle}>{service.name}</h3>
                      <p className={styles.cardDescription}>{service.description}</p>
                    </div>
                    <span className={service.configured ? styles.statusGood : styles.statusMissing}>
                      {service.configured ? 'Configured' : 'Missing'}
                    </span>
                  </div>

                  <div className={styles.metaRow}>
                    <div>
                      <span className={styles.metaLabel}>Key</span>
                      <span className={styles.metaValue}>
                        {service.keyPreview || 'Not set'}
                      </span>
                    </div>
                    {service.metadata?.bucket && (
                      <div>
                        <span className={styles.metaLabel}>Bucket</span>
                        <span className={styles.metaValue}>{service.metadata.bucket}</span>
                      </div>
                    )}
                    {service.metadata?.region && (
                      <div>
                        <span className={styles.metaLabel}>Region</span>
                        <span className={styles.metaValue}>{service.metadata.region}</span>
                      </div>
                    )}
                    {service.metadata?.indexName && (
                      <div>
                        <span className={styles.metaLabel}>Index</span>
                        <span className={styles.metaValue}>{service.metadata.indexName}</span>
                      </div>
                    )}
                  </div>

                  {service.warning && (
                    <Alert variant="warning" className={styles.warningAlert}>
                      {service.warning}
                    </Alert>
                  )}

                  <div className={styles.fields}>{renderFields(service.id)}</div>

                  <div className={styles.cardActions}>
                    <Button
                      variant="secondary"
                      onClick={() => handleTest(service.id)}
                      loading={loadingService[service.id]}
                    >
                      Run Test
                    </Button>
                    <span className={styles.actionNote}>
                      Leave fields blank to use configured credentials.
                    </span>
                  </div>

                  {result && (
                    <div className={styles.result}>
                      <Alert variant={result.success ? 'success' : 'error'}>
                        {result.message}
                        {result.durationMs > 0 && (
                          <span className={styles.resultDuration}> ({result.durationMs}ms)</span>
                        )}
                      </Alert>
                      {result.checks && result.checks.length > 0 && (
                        <ul className={styles.checkList}>
                          {result.checks.map((check) => (
                            <li key={check.name} className={check.success ? styles.checkOk : styles.checkFail}>
                              <strong>{check.name}:</strong> {check.message}
                            </li>
                          ))}
                        </ul>
                      )}
                      {result.details && (
                        <pre className={styles.resultDetails}>
                          {JSON.stringify(result.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default AdminTestingPage;
