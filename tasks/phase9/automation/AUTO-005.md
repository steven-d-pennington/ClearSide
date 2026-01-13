# AUTO-005: Notification Service

**Task ID:** AUTO-005
**Phase:** Phase 9
**Category:** Podcast Automation
**Priority:** P1
**Estimated Effort:** S (2-3 hours)
**Dependencies:** None
**Status:** Ready

---

## Context

When episodes are published, the user should be notified via email. This service uses Resend (already configured with `invitation.monkeylovestack.com` domain) to send professional email notifications with episode details and RSS feed link.

**References:**
- Resend documentation: https://resend.com/docs
- Existing domain: `invitation.monkeylovestack.com`
- User email: `steve.d.pennington@gmail.com`

---

## Requirements

### Acceptance Criteria

- [ ] Install `resend` npm package
- [ ] Create `NotificationService` class
- [ ] Send episode published email with details
- [ ] Include: title, description, audio URL, RSS URL
- [ ] HTML email template
- [ ] Error handling (don't block pipeline on email failure)
- [ ] Test: Email delivered successfully

### Functional Requirements

**Email Content:**
- Subject: "New Episode: {Episode Title}"
- Body includes:
  - Episode title and description
  - Direct MP3 link
  - RSS feed link
  - Note that Spotify will index within 1-6 hours

**Error Handling:**
- If email fails, log error but don't fail the job
- Return success even if notification fails
- Optionally retry once

---

## Implementation

### 1. Install Dependencies

```bash
cd backend
npm install resend
```

### 2. Notification Service

**File:** `backend/src/services/notifications/notification-service.ts` (new)

```typescript
/**
 * Notification Service
 *
 * Sends email notifications for podcast automation events.
 * Uses Resend with invitation.monkeylovestack.com domain.
 */

import { Resend } from 'resend';
import pino from 'pino';

const logger = pino({
  name: 'notification-service',
  level: process.env.LOG_LEVEL || 'info',
});

export interface EpisodePublishedEmailOptions {
  recipientEmail: string;
  episodeTitle: string;
  episodeDescription: string;
  episodeUrl: string;
  rssFeedUrl: string;
}

export class NotificationService {
  private resend: Resend;
  private fromEmail: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      logger.warn('RESEND_API_KEY not set - notifications disabled');
    }

    this.resend = new Resend(apiKey);
    this.fromEmail = 'ClearSide Podcasts <podcasts@invitation.monkeylovestack.com>';
  }

  /**
   * Send episode published notification email
   */
  async sendEpisodePublishedEmail(options: EpisodePublishedEmailOptions): Promise<boolean> {
    const {
      recipientEmail,
      episodeTitle,
      episodeDescription,
      episodeUrl,
      rssFeedUrl,
    } = options;

    if (!process.env.RESEND_API_KEY) {
      logger.warn('Resend API key not set, skipping email notification');
      return false;
    }

    try {
      logger.info({ recipientEmail, episodeTitle }, 'Sending episode published email');

      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: recipientEmail,
        subject: `New Episode: ${episodeTitle}`,
        html: this.generateEpisodePublishedHtml(options),
      });

      logger.info({ emailId: result.data?.id }, 'Email sent successfully');
      return true;

    } catch (error: any) {
      logger.error({
        error: error.message,
        recipientEmail,
        episodeTitle,
      }, 'Failed to send email notification');

      // Don't throw - email failure shouldn't fail the pipeline
      return false;
    }
  }

  /**
   * Generate HTML email for episode published notification
   */
  private generateEpisodePublishedHtml(options: EpisodePublishedEmailOptions): string {
    const {
      episodeTitle,
      episodeDescription,
      episodeUrl,
      rssFeedUrl,
    } = options;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Episode Published</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px 10px 0 0;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .content {
      background: #fff;
      padding: 30px;
      border: 1px solid #e0e0e0;
      border-top: none;
      border-radius: 0 0 10px 10px;
    }
    .episode-title {
      font-size: 20px;
      font-weight: bold;
      color: #667eea;
      margin-bottom: 15px;
    }
    .episode-description {
      margin-bottom: 25px;
      color: #555;
    }
    .links {
      background: #f9f9f9;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .links h3 {
      margin-top: 0;
      font-size: 16px;
      color: #333;
    }
    .link-item {
      margin: 10px 0;
    }
    .link-item a {
      color: #667eea;
      text-decoration: none;
      font-weight: 500;
    }
    .link-item a:hover {
      text-decoration: underline;
    }
    .note {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin-top: 20px;
      font-size: 14px;
      color: #856404;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 12px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎙️ New Podcast Episode Published</h1>
  </div>

  <div class="content">
    <div class="episode-title">${episodeTitle}</div>

    <div class="episode-description">${episodeDescription}</div>

    <div class="links">
      <h3>Listen Now:</h3>
      <div class="link-item">
        🎧 <a href="${episodeUrl}">Direct MP3 Link</a>
      </div>
      <div class="link-item">
        📡 <a href="${rssFeedUrl}">RSS Feed</a>
      </div>
      <div class="link-item">
        🎵 Spotify (will appear within 1-6 hours)
      </div>
    </div>

    <div class="note">
      <strong>Note:</strong> Spotify and other podcast platforms automatically poll your RSS feed every 1-6 hours.
      Your new episode should appear on Spotify within the next few hours.
    </div>
  </div>

  <div class="footer">
    <p>
      This is an automated notification from ClearSide Podcast Automation.<br>
      Powered by <a href="https://clearside.app" style="color: #667eea;">ClearSide</a>
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Send error notification email
   */
  async sendErrorNotification(options: {
    recipientEmail: string;
    errorMessage: string;
    sessionId: string;
    failedStep: string;
  }): Promise<boolean> {
    if (!process.env.RESEND_API_KEY) {
      return false;
    }

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: options.recipientEmail,
        subject: `❌ Podcast Automation Failed`,
        html: `
<h1>Podcast Automation Error</h1>
<p><strong>Session ID:</strong> ${options.sessionId}</p>
<p><strong>Failed Step:</strong> ${options.failedStep}</p>
<p><strong>Error:</strong> ${options.errorMessage}</p>
<p>Please check the logs and retry manually if needed.</p>
        `,
      });

      return true;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to send error notification');
      return false;
    }
  }
}

/**
 * Factory function
 */
export function createNotificationService(): NotificationService {
  return new NotificationService();
}
```

---

## Testing

### Test 1: Send Test Email

```typescript
import { createNotificationService } from './notification-service.js';

const service = createNotificationService();

await service.sendEpisodePublishedEmail({
  recipientEmail: 'steve.d.pennington@gmail.com',
  episodeTitle: 'Test Episode: AI Regulation Debate',
  episodeDescription: 'A test episode to verify email notifications are working.',
  episodeUrl: 'https://clearside.app/exports/podcasts/test.mp3',
  rssFeedUrl: 'https://clearside.app/rss/podcast.xml',
});

console.log('Check your inbox!');
```

### Test 2: Missing API Key

```typescript
// Temporarily unset RESEND_API_KEY
delete process.env.RESEND_API_KEY;

const service = createNotificationService();
const result = await service.sendEpisodePublishedEmail({ ... });

// Should return false but not throw error
expect(result).toBe(false);
```

### Test 3: Error Notification

```typescript
await service.sendErrorNotification({
  recipientEmail: 'steve.d.pennington@gmail.com',
  errorMessage: 'TTS generation timeout',
  sessionId: 'session-123',
  failedStep: 'TTS Audio Generation',
});
```

---

## Definition of Done

- [ ] `resend` npm package installed
- [ ] `NotificationService` class implemented
- [ ] Episode published email template
- [ ] HTML email with styling
- [ ] Error notification method
- [ ] Graceful failure (don't block pipeline)
- [ ] Test email delivered successfully
- [ ] Environment variable documented

---

## Notes

**Environment Variables:**

```bash
# Resend API Key
RESEND_API_KEY=re_...

# Notification recipient
NOTIFICATION_EMAIL=steve.d.pennington@gmail.com
```

**Resend Free Tier:**
- 3,000 emails per month
- 100 emails per day
- Sufficient for podcast notifications

**Email Deliverability:**
- Domain: `invitation.monkeylovestack.com` (already verified)
- From address: `podcasts@invitation.monkeylovestack.com`
- SPF, DKIM configured by Resend
