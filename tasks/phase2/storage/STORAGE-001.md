# STORAGE-001: S3 Storage Integration

**Task ID:** STORAGE-001
**Phase:** Phase 2
**Category:** Storage
**Priority:** P1
**Estimated Effort:** 2 days
**Dependencies:** None
**Status:** TO DO

---

## Overview

Integrate AWS S3 for storing exported files (PDFs, audio, video). Implement upload, signed URLs, lifecycle policies, and CDN integration.

---

## Objectives

1. S3 bucket configuration
2. File upload with progress
3. Signed URL generation
4. Lifecycle policies (auto-delete after 30 days)
5. CloudFront CDN integration

---

## Technical Specification

```typescript
// src/services/storage/s3Storage.ts

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class S3Storage {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({ region: process.env.AWS_REGION });
    this.bucket = process.env.S3_BUCKET_NAME!;
  }

  async uploadFile(filePath: string, key: string): Promise<string> {
    const fileContent = await fs.readFile(filePath);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileContent,
        ContentType: this.getContentType(key),
      })
    );

    return await this.getSignedUrl(key);
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  private getContentType(filename: string): string {
    const ext = filename.split('.').pop();
    const types: Record<string, string> = {
      pdf: 'application/pdf',
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
      md: 'text/markdown',
    };
    return types[ext || ''] || 'application/octet-stream';
  }
}
```

---

**Last Updated:** 2025-12-23
