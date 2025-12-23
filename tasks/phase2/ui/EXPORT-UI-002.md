# EXPORT-UI-002: Export Status Dashboard

**Task ID:** EXPORT-UI-002
**Phase:** Phase 2
**Category:** UI - Export Features
**Priority:** P1
**Estimated Effort:** 3 days
**Dependencies:** EXPORT-UI-001, QUEUE-001, QUEUE-002
**Status:** TO DO

---

## Overview

Create export status dashboard showing job progress, queue position, completion status, and download links. Support real-time updates via SSE.

---

## Objectives

1. Job status display with progress bars
2. Real-time updates via SSE
3. Download buttons for completed exports
4. Error handling and retry options
5. Export history view

---

## Component Structure

```typescript
// src/components/ExportStatus/ExportStatusDashboard.tsx

export const ExportStatusDashboard: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const { jobs, isLoading } = useExportJobs(sessionId);

  return (
    <div className="export-status-dashboard">
      <h3>Your Exports</h3>
      {jobs.map((job) => (
        <ExportJobCard key={job.id} job={job} />
      ))}
    </div>
  );
};

const ExportJobCard: React.FC<{ job: ExportJob }> = ({ job }) => {
  const { progress, status, downloadUrl, error } = useJobStatus(job.id);

  return (
    <div className="export-job-card">
      <div className="job-header">
        <FormatBadge format={job.format} />
        <StatusBadge status={status} />
      </div>
      {status === 'processing' && <ProgressBar progress={progress} />}
      {status === 'completed' && <DownloadButton url={downloadUrl} />}
      {status === 'failed' && <ErrorMessage error={error} onRetry={() => retryJob(job.id)} />}
    </div>
  );
};
```

---

**Last Updated:** 2025-12-23
