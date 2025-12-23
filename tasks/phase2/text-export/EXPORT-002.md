# EXPORT-002: PDF Export Generator

**Task ID:** EXPORT-002
**Phase:** Phase 2
**Category:** Text Export
**Priority:** P1
**Estimated Effort:** 3 days
**Dependencies:** EXPORT-001
**Status:** TO DO

---

## Overview

Generate professional PDF exports using Puppeteer for HTML-to-PDF conversion. Support custom styling, headers/footers, table of contents, and page numbering.

---

## Objectives

1. PDF generation with Puppeteer
2. Professional styling and layout
3. Table of contents with page links
4. Headers/footers with metadata
5. Async processing with queue

---

## Technical Specification

```typescript
// src/services/export/pdfExporter.ts

import puppeteer from 'puppeteer';
import { DebateOutput } from '@/types/debate';

export class PDFExporter {
  async exportToPDF(output: DebateOutput, options = {}): Promise<Buffer> {
    const html = this.generateHTML(output, options);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox'],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      displayHeaderFooter: true,
      headerTemplate: this.getHeaderTemplate(output),
      footerTemplate: this.getFooterTemplate(),
    });

    await browser.close();
    return pdf;
  }

  private generateHTML(output: DebateOutput, options: any): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>${this.getStyles()}</style>
        </head>
        <body>
          <div class="cover">
            <h1>${output.proposition.normalized}</h1>
            <p class="subtitle">AI-Powered Debate Analysis</p>
            <p class="date">${new Date().toLocaleDateString()}</p>
          </div>
          <div class="toc">
            <h2>Table of Contents</h2>
            <ul>
              <li><a href="#proposition">Proposition</a></li>
              <li><a href="#pro">Arguments FOR</a></li>
              <li><a href="#con">Arguments AGAINST</a></li>
              <li><a href="#moderator">Moderator Synthesis</a></li>
            </ul>
          </div>
          <div id="proposition">
            ${this.formatProposition(output.proposition)}
          </div>
          <div id="pro">
            ${this.formatPro(output.pro)}
          </div>
          <div id="con">
            ${this.formatCon(output.con)}
          </div>
          <div id="moderator">
            ${this.formatModerator(output.moderator)}
          </div>
        </body>
      </html>
    `;
  }

  private getStyles(): string {
    return `
      @page {
        size: A4;
        margin: 20mm;
      }
      body {
        font-family: 'Georgia', serif;
        line-height: 1.6;
        color: #333;
      }
      .cover {
        page-break-after: always;
        text-align: center;
        padding-top: 40%;
      }
      .cover h1 {
        font-size: 2.5rem;
        margin-bottom: 1rem;
      }
      .toc {
        page-break-after: always;
      }
      h2 {
        color: #2563eb;
        border-bottom: 2px solid #2563eb;
        padding-bottom: 0.5rem;
      }
      .argument {
        page-break-inside: avoid;
        margin-bottom: 2rem;
        padding: 1rem;
        border-left: 4px solid #059669;
      }
    `;
  }

  private getHeaderTemplate(output: DebateOutput): string {
    return `
      <div style="font-size: 10px; text-align: center; width: 100%; padding: 5mm;">
        <span>${output.proposition.normalized.slice(0, 100)}...</span>
      </div>
    `;
  }

  private getFooterTemplate(): string {
    return `
      <div style="font-size: 10px; text-align: center; width: 100%; padding: 5mm;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>
    `;
  }

  async downloadPDF(pdf: Buffer, filename: string = 'debate-analysis.pdf') {
    const blob = new Blob([pdf], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
```

---

## Implementation Steps

1. **Day 1:** Set up Puppeteer, create HTML templates
2. **Day 2:** Implement styling and layout
3. **Day 3:** Add TOC, headers/footers, queue integration

---

## Validation Steps

- [ ] PDF generates correctly
- [ ] Styling looks professional
- [ ] TOC links work
- [ ] Page numbers correct
- [ ] Tests pass

---

**Last Updated:** 2025-12-23
