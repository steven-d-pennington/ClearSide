/**
 * AdminTestingPage
 *
 * Admin tools for validating external integrations (TTS, LLMs, research APIs).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Input, Textarea } from '../components/ui';
import styles from './AdminTestingPage.module.css';

interface ServiceField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'textarea';
  required?: boolean;
  placeholder?: string;
  hint?: string;
}

interface ServiceStatus {
  id: string;
  name: string;
  category: 'tts' | 'llm' | 'research';
  description: string;
  envVars: string[];
  fields: ServiceField[];
  configured: boolean;
  credentialPreview?: string;
  details?: Record<string, string | number | boolean | undefined>;
}

interface TestResult {
  ok: boolean;
  message: string;
  details?: Record<string, string | number | boolean | undefined>;
}

export function AdminTestingPage() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, Record<string, string>>>({});
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  const groupedServices = useMemo(() => {
    return services.reduce(
      (acc, service) => {
        acc[service.category].push(service);
        return acc;
      },
      {
        tts: [] as ServiceStatus[],
        llm: [] as ServiceStatus[],
        research: [] as ServiceStatus[],
      }
    );
  }, [services]);

  const fetchServices = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/testing/services`);
      if (!response.ok) throw new Error('Failed to load testing services');
      const data = await response.json();
      setServices(data.services || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching testing services:', err);
      setError(err instanceof Error ? err.message : 'Failed to load testing services');
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const updateField = (serviceId: string, field: string, value: string) => {
    setFormState((prev) => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        [field]: value,
      },
    }));
  };

  const runTest = async (service: ServiceStatus) => {
    setRunning((prev) => ({ ...prev, [service.id]: true }));
    try {
      const config = Object.entries(formState[service.id] || {})
        .filter(([, value]) => value && value.trim().length > 0)
        .reduce<Record<string, string>>((acc, [key, value]) => {
          acc[key] = value.trim();
          return acc;
        }, {});

      const response = await fetch(`${API_BASE_URL}/api/admin/testing/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: service.id,
          config,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Test failed');
      }
      setResults((prev) => ({ ...prev, [service.id]: data }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [service.id]: {
          ok: false,
          message: err instanceof Error ? err.message : 'Test failed',
        },
      }));
    } finally {
      setRunning((prev) => ({ ...prev, [service.id]: false }));
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading testing tools...</div>
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
          <h1 className={styles.title}>External Service Testing</h1>
          <p className={styles.subtitle}>
            Validate credentials, connectivity, and responses without burning tokens.
          </p>
        </div>
        <Button variant="ghost" onClick={fetchServices}>
          Refresh Status
        </Button>
      </header>

      <Alert variant="info" className={styles.notice}>
        All tests run via the backend. Paste a temporary key below to override the configured
        environment values for a single check.
      </Alert>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Text-to-Speech Providers</h2>
        <div className={styles.grid}>
          {groupedServices.tts.map((service) => (
            <div key={service.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>{service.name}</h3>
                  <p className={styles.cardSubtitle}>{service.description}</p>
                </div>
                <Badge variant={service.configured ? 'success' : 'warning'}>
                  {service.configured ? 'Configured' : 'Missing'}
                </Badge>
              </div>

              <div className={styles.meta}>
                <div>
                  <span className={styles.metaLabel}>Env Vars</span>
                  <span>{service.envVars.length ? service.envVars.join(', ') : 'None'}</span>
                </div>
                <div>
                  <span className={styles.metaLabel}>Key Preview</span>
                  <span>{service.credentialPreview || 'Not set'}</span>
                </div>
                {service.details &&
                  Object.entries(service.details).map(([key, value]) => (
                    <div key={key}>
                      <span className={styles.metaLabel}>{key}</span>
                      <span>{String(value)}</span>
                    </div>
                  ))}
              </div>

              {service.fields.length > 0 ? (
                <div className={styles.fields}>
                  {service.fields.map((field) => {
                    const value = formState[service.id]?.[field.name] || '';
                    if (field.type === 'textarea') {
                      return (
                        <Textarea
                          key={field.name}
                          label={field.label}
                          placeholder={field.placeholder}
                          value={value}
                          onChange={(event) => updateField(service.id, field.name, event.target.value)}
                          helperText={field.hint}
                          rows={4}
                          fullWidth
                        />
                      );
                    }
                    return (
                      <Input
                        key={field.name}
                        label={field.label}
                        type={field.type}
                        placeholder={field.placeholder}
                        value={value}
                        onChange={(event) => updateField(service.id, field.name, event.target.value)}
                        helperText={field.hint}
                        fullWidth
                      />
                    );
                  })}
                </div>
              ) : (
                <div className={styles.noFields}>No credentials required.</div>
              )}

              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  onClick={() => runTest(service)}
                  loading={running[service.id]}
                  className={styles.actionButton}
                >
                  Run Test
                </Button>
              </div>

              {results[service.id] && (
                <Alert
                  variant={results[service.id].ok ? 'success' : 'error'}
                  className={styles.result}
                >
                  <div className={styles.resultMessage}>{results[service.id].message}</div>
                  {results[service.id].details && (
                    <ul className={styles.resultList}>
                      {Object.entries(results[service.id].details || {}).map(([key, value]) => (
                        <li key={key}>
                          <strong>{key}:</strong> {String(value)}
                        </li>
                      ))}
                    </ul>
                  )}
                </Alert>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>LLM Providers</h2>
        <div className={styles.grid}>
          {groupedServices.llm.map((service) => (
            <div key={service.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>{service.name}</h3>
                  <p className={styles.cardSubtitle}>{service.description}</p>
                </div>
                <Badge variant={service.configured ? 'success' : 'warning'}>
                  {service.configured ? 'Configured' : 'Missing'}
                </Badge>
              </div>

              <div className={styles.meta}>
                <div>
                  <span className={styles.metaLabel}>Env Vars</span>
                  <span>{service.envVars.length ? service.envVars.join(', ') : 'None'}</span>
                </div>
                <div>
                  <span className={styles.metaLabel}>Key Preview</span>
                  <span>{service.credentialPreview || 'Not set'}</span>
                </div>
                {service.details &&
                  Object.entries(service.details).map(([key, value]) => (
                    <div key={key}>
                      <span className={styles.metaLabel}>{key}</span>
                      <span>{String(value)}</span>
                    </div>
                  ))}
              </div>

              {service.fields.length > 0 && (
                <div className={styles.fields}>
                  {service.fields.map((field) => (
                    <Input
                      key={field.name}
                      label={field.label}
                      type={field.type}
                      placeholder={field.placeholder}
                      value={formState[service.id]?.[field.name] || ''}
                      onChange={(event) => updateField(service.id, field.name, event.target.value)}
                      helperText={field.hint}
                      fullWidth
                    />
                  ))}
                </div>
              )}

              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  onClick={() => runTest(service)}
                  loading={running[service.id]}
                  className={styles.actionButton}
                >
                  Run Test
                </Button>
              </div>

              {results[service.id] && (
                <Alert
                  variant={results[service.id].ok ? 'success' : 'error'}
                  className={styles.result}
                >
                  <div className={styles.resultMessage}>{results[service.id].message}</div>
                  {results[service.id].details && (
                    <ul className={styles.resultList}>
                      {Object.entries(results[service.id].details || {}).map(([key, value]) => (
                        <li key={key}>
                          <strong>{key}:</strong> {String(value)}
                        </li>
                      ))}
                    </ul>
                  )}
                </Alert>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Research Integrations</h2>
        <div className={styles.grid}>
          {groupedServices.research.map((service) => (
            <div key={service.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>{service.name}</h3>
                  <p className={styles.cardSubtitle}>{service.description}</p>
                </div>
                <Badge variant={service.configured ? 'success' : 'warning'}>
                  {service.configured ? 'Configured' : 'Missing'}
                </Badge>
              </div>

              <div className={styles.meta}>
                <div>
                  <span className={styles.metaLabel}>Env Vars</span>
                  <span>{service.envVars.length ? service.envVars.join(', ') : 'None'}</span>
                </div>
                <div>
                  <span className={styles.metaLabel}>Key Preview</span>
                  <span>{service.credentialPreview || 'Not set'}</span>
                </div>
                {service.details &&
                  Object.entries(service.details).map(([key, value]) => (
                    <div key={key}>
                      <span className={styles.metaLabel}>{key}</span>
                      <span>{String(value)}</span>
                    </div>
                  ))}
              </div>

              {service.fields.length > 0 && (
                <div className={styles.fields}>
                  {service.fields.map((field) => (
                    <Input
                      key={field.name}
                      label={field.label}
                      type={field.type}
                      placeholder={field.placeholder}
                      value={formState[service.id]?.[field.name] || ''}
                      onChange={(event) => updateField(service.id, field.name, event.target.value)}
                      helperText={field.hint}
                      fullWidth
                    />
                  ))}
                </div>
              )}

              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  onClick={() => runTest(service)}
                  loading={running[service.id]}
                  className={styles.actionButton}
                >
                  Run Test
                </Button>
              </div>

              {results[service.id] && (
                <Alert
                  variant={results[service.id].ok ? 'success' : 'error'}
                  className={styles.result}
                >
                  <div className={styles.resultMessage}>{results[service.id].message}</div>
                  {results[service.id].details && (
                    <ul className={styles.resultList}>
                      {Object.entries(results[service.id].details || {}).map(([key, value]) => (
                        <li key={key}>
                          <strong>{key}:</strong> {String(value)}
                        </li>
                      ))}
                    </ul>
                  )}
                </Alert>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
