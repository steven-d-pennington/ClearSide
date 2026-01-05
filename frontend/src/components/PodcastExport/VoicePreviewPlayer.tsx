/**
 * VoicePreviewPlayer Component
 *
 * Plays voice preview samples from ElevenLabs.
 * Uses the cheaper flash model for previews to save costs.
 */

import { useState, useRef, useEffect } from 'react';
import { Button } from '../ui';
import styles from './VoicePreviewPlayer.module.css';

interface VoicePreviewPlayerProps {
  voiceId: string | undefined;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  previewText?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Default preview text for voice samples
const DEFAULT_PREVIEW_TEXT =
  'This is a sample of how this voice will sound in your podcast.';

export function VoicePreviewPlayer({
  voiceId,
  isPlaying,
  onPlay,
  onStop,
  previewText = DEFAULT_PREVIEW_TEXT,
}: VoicePreviewPlayerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Create audio element on mount
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.onended = () => {
      onStop();
    };
    audioRef.current.onerror = () => {
      setError('Failed to play audio');
      onStop();
    };

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [onStop]);

  // Handle play/stop state changes
  useEffect(() => {
    if (!isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [isPlaying]);

  const handlePlayClick = async () => {
    if (!voiceId) {
      setError('No voice selected');
      return;
    }

    if (isPlaying) {
      onStop();
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Request voice preview from API
      const response = await fetch(`${API_BASE_URL}/api/exports/podcast/preview-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId,
          text: previewText,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate preview');
      }

      // Get audio blob
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Play audio
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        await audioRef.current.play();
        onPlay();
      }

      // Clean up object URL when audio ends
      if (audioRef.current) {
        audioRef.current.onended = () => {
          URL.revokeObjectURL(audioUrl);
          onStop();
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to play preview';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <Button
        variant="ghost"
        size="sm"
        onClick={handlePlayClick}
        disabled={!voiceId || isLoading}
        className={styles.playButton}
        aria-label={isPlaying ? 'Stop preview' : 'Play preview'}
        title={isPlaying ? 'Stop preview' : 'Preview voice'}
      >
        {isLoading ? (
          <span className={styles.spinner} />
        ) : isPlaying ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
          >
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
      </Button>

      {error && (
        <span className={styles.error} title={error}>
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
        </span>
      )}
    </div>
  );
}

export default VoicePreviewPlayer;
