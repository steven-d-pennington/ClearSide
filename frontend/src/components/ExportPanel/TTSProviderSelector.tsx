/**
 * TTSProviderSelector Component
 *
 * Displays available TTS providers and allows selection.
 * Shows quality, free tier info, and availability status.
 */

import React from 'react';
import { Badge } from '../ui';
import type { TTSProvider, TTSProviderInfo, TTSQuality } from '../../types/export';
import styles from './TTSProviderSelector.module.css';

interface TTSProviderSelectorProps {
  providers: TTSProviderInfo[];
  selectedProvider: TTSProvider;
  onSelectProvider: (provider: TTSProvider) => void;
  defaultProvider: TTSProvider;
}

const QUALITY_BADGE_VARIANT: Record<TTSQuality, 'success' | 'primary' | 'secondary' | 'warning'> = {
  premium: 'success',
  high: 'primary',
  good: 'secondary',
  standard: 'warning',
};

const QUALITY_LABEL: Record<TTSQuality, string> = {
  premium: 'Premium',
  high: 'High',
  good: 'Good',
  standard: 'Standard',
};

export const TTSProviderSelector: React.FC<TTSProviderSelectorProps> = ({
  providers,
  selectedProvider,
  onSelectProvider,
  defaultProvider,
}) => {
  if (providers.length === 0) {
    return (
      <div className={styles.container}>
        <label className={styles.label}>TTS Provider</label>
        <div className={styles.loading}>Loading providers...</div>
      </div>
    );
  }

  // Sort providers: available first, then by quality
  const sortedProviders = [...providers].sort((a, b) => {
    if (a.available !== b.available) {
      return a.available ? -1 : 1;
    }
    const qualityOrder = { premium: 0, high: 1, good: 2, standard: 3 };
    return qualityOrder[a.quality] - qualityOrder[b.quality];
  });

  return (
    <div className={styles.container}>
      <label className={styles.label}>
        TTS Provider
        <span className={styles.labelHint}>Select voice generation service</span>
      </label>

      <div className={styles.providerList}>
        {sortedProviders.map((provider) => (
          <button
            key={provider.id}
            className={`${styles.providerCard} ${
              selectedProvider === provider.id ? styles.selected : ''
            } ${!provider.available ? styles.unavailable : ''}`}
            onClick={() => provider.available && onSelectProvider(provider.id)}
            disabled={!provider.available}
            title={
              !provider.available
                ? `${provider.name} requires ${provider.envVar} to be configured`
                : provider.description
            }
          >
            <div className={styles.providerHeader}>
              <span className={styles.providerName}>
                {provider.name}
                {provider.id === defaultProvider && (
                  <Badge variant="secondary" className={styles.defaultBadge}>
                    Default
                  </Badge>
                )}
              </span>
              <Badge variant={QUALITY_BADGE_VARIANT[provider.quality]}>
                {QUALITY_LABEL[provider.quality]}
              </Badge>
            </div>

            <p className={styles.providerDescription}>{provider.description}</p>

            <div className={styles.providerFooter}>
              <span className={styles.freeTier}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                {provider.freeTier}
              </span>

              {!provider.available && (
                <span className={styles.notConfigured}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  Not configured
                </span>
              )}
            </div>

            {selectedProvider === provider.id && provider.available && (
              <div className={styles.selectedIndicator}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Free option callout */}
      {providers.some((p) => p.id === 'edge' && p.available) && (
        <div className={styles.freeCallout}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>
            <strong>Edge TTS</strong> is completely free and requires no API key.
            Great for testing!
          </span>
        </div>
      )}
    </div>
  );
};

export default TTSProviderSelector;
