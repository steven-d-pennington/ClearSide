/**
 * Google Cloud Storage Helper
 *
 * Utilities for downloading and managing files from GCS buckets.
 * Used by Google Cloud Long Audio Synthesis to retrieve generated audio.
 */

import axios, { AxiosError } from 'axios';
import pino from 'pino';

const logger = pino({
  name: 'gcs-helper',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Parse a GCS URI into bucket and object path
 * @param gcsUri - URI in format gs://bucket/path/to/object
 */
export function parseGcsUri(gcsUri: string): { bucket: string; objectPath: string } {
  const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid GCS URI: ${gcsUri}`);
  }
  return {
    bucket: match[1]!,
    objectPath: match[2]!,
  };
}

/**
 * Download a file from Google Cloud Storage
 *
 * @param gcsUri - GCS URI (gs://bucket/path/to/file)
 * @param accessToken - OAuth2 access token
 * @returns File contents as Buffer
 */
export async function downloadFromGcs(
  gcsUri: string,
  accessToken: string
): Promise<Buffer> {
  const { bucket, objectPath } = parseGcsUri(gcsUri);

  // URL-encode the object path for the API
  const encodedPath = encodeURIComponent(objectPath);
  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodedPath}?alt=media`;

  logger.debug({ bucket, objectPath }, 'Downloading file from GCS');

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      responseType: 'arraybuffer',
      timeout: 300000, // 5 minute timeout for large files
    });

    const buffer = Buffer.from(response.data);
    logger.info(
      { bucket, objectPath, size: buffer.length },
      'Downloaded file from GCS'
    );

    return buffer;
  } catch (error) {
    const axiosError = error as AxiosError;
    logger.error(
      {
        bucket,
        objectPath,
        status: axiosError.response?.status,
        error: axiosError.message,
      },
      'Failed to download from GCS'
    );
    throw new Error(`GCS download failed: ${axiosError.message}`);
  }
}

/**
 * Delete a file from Google Cloud Storage
 *
 * @param gcsUri - GCS URI (gs://bucket/path/to/file)
 * @param accessToken - OAuth2 access token
 */
export async function deleteFromGcs(
  gcsUri: string,
  accessToken: string
): Promise<void> {
  const { bucket, objectPath } = parseGcsUri(gcsUri);

  const encodedPath = encodeURIComponent(objectPath);
  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodedPath}`;

  logger.debug({ bucket, objectPath }, 'Deleting file from GCS');

  try {
    await axios.delete(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 30000,
    });

    logger.info({ bucket, objectPath }, 'Deleted file from GCS');
  } catch (error) {
    const axiosError = error as AxiosError;
    // 404 is OK - file already deleted
    if (axiosError.response?.status === 404) {
      logger.debug({ bucket, objectPath }, 'File already deleted from GCS');
      return;
    }

    logger.warn(
      {
        bucket,
        objectPath,
        status: axiosError.response?.status,
        error: axiosError.message,
      },
      'Failed to delete from GCS (non-fatal)'
    );
    // Don't throw - cleanup failures are not critical
  }
}

/**
 * Check if a file exists in GCS
 *
 * @param gcsUri - GCS URI (gs://bucket/path/to/file)
 * @param accessToken - OAuth2 access token
 */
export async function existsInGcs(
  gcsUri: string,
  accessToken: string
): Promise<boolean> {
  const { bucket, objectPath } = parseGcsUri(gcsUri);

  const encodedPath = encodeURIComponent(objectPath);
  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodedPath}`;

  try {
    await axios.head(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 10000,
    });
    return true;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 404) {
      return false;
    }
    throw error;
  }
}
