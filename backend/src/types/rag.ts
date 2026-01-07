/**
 * RAG (Retrieval-Augmented Generation) Types
 * Types for integrating RAG into the debate orchestrators
 */

export interface CitationMetadata {
  citationsProvided: number;       // How many citations were available
  citationsUsed: string[];         // Source URLs that appear in response
  relevanceScores: number[];       // Scores of provided citations
  queryUsed: string;               // What query was used to retrieve citations
}

export interface RAGEnabledDebateConfig {
  enableRAG: boolean;
  episodeId?: string;
  minCitationRelevance: number;    // 0-1, minimum score to include citation
  maxCitationsPerTurn: number;     // Limit citations per turn
  citationStyle: 'natural' | 'academic' | 'minimal';
}

export const DEFAULT_RAG_CONFIG: RAGEnabledDebateConfig = {
  enableRAG: true,
  minCitationRelevance: 0.6,
  maxCitationsPerTurn: 5,
  citationStyle: 'natural',
};

export interface DebateWithEpisode {
  debateId: string;
  episodeId?: string;
  ragEnabled: boolean;
}
