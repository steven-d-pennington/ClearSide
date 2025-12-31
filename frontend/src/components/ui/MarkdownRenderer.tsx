/**
 * MarkdownRenderer Component
 *
 * Lightweight markdown renderer for debate content.
 * Handles common markdown patterns without external dependencies.
 */

import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Parse and render markdown content as React elements
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  const renderContent = () => {
    // Split content into lines for processing
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let currentParagraph: string[] = [];
    let inList = false;
    let listItems: string[] = [];
    let listType: 'ul' | 'ol' = 'ul';
    let key = 0;

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const text = currentParagraph.join(' ');
        if (text.trim()) {
          elements.push(
            <p key={key++} style={{ margin: '0.5rem 0' }}>
              {renderInlineMarkdown(text)}
            </p>
          );
        }
        currentParagraph = [];
      }
    };

    const flushList = () => {
      if (listItems.length > 0) {
        const ListTag = listType;
        elements.push(
          <ListTag key={key++} style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
            {listItems.map((item, i) => (
              <li key={i}>{renderInlineMarkdown(item)}</li>
            ))}
          </ListTag>
        );
        listItems = [];
        inList = false;
      }
    };

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Empty line - flush paragraph
      if (!trimmedLine) {
        flushList();
        flushParagraph();
        continue;
      }

      // Headers
      const headerMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        flushList();
        flushParagraph();
        const level = headerMatch[1].length;
        const text = headerMatch[2];
        const tagName = `h${Math.min(level + 1, 6)}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
        const fontSize = level === 1 ? '1.25rem' : level === 2 ? '1.1rem' : '1rem';
        elements.push(
          React.createElement(
            tagName,
            { key: key++, style: { fontWeight: 600, fontSize, margin: '0.75rem 0 0.5rem' } },
            renderInlineMarkdown(text)
          )
        );
        continue;
      }

      // Horizontal rule
      if (trimmedLine.match(/^[-*_]{3,}$/)) {
        flushList();
        flushParagraph();
        elements.push(<hr key={key++} style={{ margin: '1rem 0', borderColor: '#e5e7eb' }} />);
        continue;
      }

      // Unordered list
      const ulMatch = trimmedLine.match(/^[-*+]\s+(.+)$/);
      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          flushList();
          flushParagraph();
          inList = true;
          listType = 'ul';
        }
        listItems.push(ulMatch[1]);
        continue;
      }

      // Ordered list
      const olMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        if (!inList || listType !== 'ol') {
          flushList();
          flushParagraph();
          inList = true;
          listType = 'ol';
        }
        listItems.push(olMatch[1]);
        continue;
      }

      // Regular text - add to current paragraph
      flushList();
      currentParagraph.push(trimmedLine);
    }

    // Flush remaining content
    flushList();
    flushParagraph();

    return elements;
  };

  return <div className={className}>{renderContent()}</div>;
};

/**
 * Render inline markdown (bold, italic, code, links)
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold with **
    let match = remaining.match(/^\*\*(.+?)\*\*/);
    if (match) {
      parts.push(<strong key={key++}>{renderInlineMarkdown(match[1])}</strong>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Bold with __
    match = remaining.match(/^__(.+?)__/);
    if (match) {
      parts.push(<strong key={key++}>{renderInlineMarkdown(match[1])}</strong>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Italic with *
    match = remaining.match(/^\*(.+?)\*/);
    if (match) {
      parts.push(<em key={key++}>{renderInlineMarkdown(match[1])}</em>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Italic with _
    match = remaining.match(/^_(.+?)_/);
    if (match) {
      parts.push(<em key={key++}>{renderInlineMarkdown(match[1])}</em>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Inline code
    match = remaining.match(/^`(.+?)`/);
    if (match) {
      parts.push(
        <code
          key={key++}
          style={{
            backgroundColor: '#f3f4f6',
            padding: '0.125rem 0.375rem',
            borderRadius: '0.25rem',
            fontFamily: 'monospace',
            fontSize: '0.875em',
          }}
        >
          {match[1]}
        </code>
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Links [text](url)
    match = remaining.match(/^\[(.+?)\]\((.+?)\)/);
    if (match) {
      parts.push(
        <a
          key={key++}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#3b82f6', textDecoration: 'underline' }}
        >
          {match[1]}
        </a>
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // No match - take one character and continue
    parts.push(remaining[0]);
    remaining = remaining.slice(1);
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
}

export default MarkdownRenderer;
