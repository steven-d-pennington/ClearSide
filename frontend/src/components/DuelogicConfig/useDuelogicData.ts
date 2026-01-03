/**
 * Hooks for fetching Duelogic configuration data from API
 */

import { useState, useEffect } from 'react';
import type { ChairInfo, ModelInfo, PresetInfo } from './duelogic-config.types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface Constraints {
  minChairs: number;
  maxChairs: number;
  minExchanges: number;
  maxExchanges: number;
}

export function useDuelogicChairs() {
  const [chairs, setChairs] = useState<ChairInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/duelogic/chairs`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setChairs(data.chairs);
        } else {
          setError(data.message || 'Failed to load chairs');
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { chairs, loading, error };
}

export function useDuelogicModels() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/duelogic/models`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setModels(data.models);
        } else {
          setError(data.message || 'Failed to load models');
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { models, loading, error };
}

export function useDuelogicPresets() {
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/duelogic/presets`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setPresets(data.presets);
        } else {
          setError(data.message || 'Failed to load presets');
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { presets, loading, error };
}

export function useDuelogicDefaults() {
  const [defaults, setDefaults] = useState<any>(null);
  const [constraints, setConstraints] = useState<Constraints>({
    minChairs: 2,
    maxChairs: 6,
    minExchanges: 2,
    maxExchanges: 10,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/duelogic/defaults`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setDefaults(data.defaults);
          if (data.constraints) {
            setConstraints(data.constraints);
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return { defaults, constraints, loading };
}

export async function createDuelogicDebate(
  proposition: string,
  config?: any,
  propositionContext?: string
): Promise<{ debateId: string; config: any }> {
  const response = await fetch(`${API_BASE_URL}/api/debates/duelogic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      proposition,
      propositionContext,
      config,
    }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.errors?.[0]?.message || 'Failed to create debate');
  }

  return {
    debateId: data.debateId,
    config: data.config,
  };
}
