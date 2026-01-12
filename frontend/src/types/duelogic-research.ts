/**
 * Duelogic Research Types
 * Types for the research dashboard and episode proposal management
 */

export type ResearchCategory =
  | 'technology_ethics'
  | 'climate_environment'
  | 'politics_governance'
  | 'bioethics_medicine'
  | 'economics_inequality'
  | 'ai_automation'
  | 'social_justice'
  | 'international_relations'
  | 'privacy_surveillance'
  | 'education_culture';

export type ResearchJobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'scheduled' | 'launched';

export interface ResearchJob {
  id: string;
  configId: string;
  configName?: string;
  status: ResearchJobStatus;
  startedAt?: string;
  completedAt?: string;
  topicsDiscovered: number;
  episodesGenerated: number;
  tokensUsed: number;
  error?: string;
  createdAt: string;
}

export interface PhilosophicalChair {
  name: string;
  position: string;
  mustAcknowledge: string;
}

export interface ViralMetrics {
  trendAlignment: number;
  titleHookStrength: number;
  controversyBalance: number;
  suggestedHashtags: string[];
  targetAudience: string;
  matchedTrends: string[];
  titlePattern?: string;
}

export interface EpisodeProposal {
  id: string;
  researchResultId: string;
  status: ProposalStatus;
  episodeNumber?: number;
  title: string;
  subtitle: string;
  description: string;
  proposition: string;
  contextForPanel: string;
  chairs: PhilosophicalChair[];
  keyTensions: string[];
  generatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  scheduledFor?: string;
  adminNotes?: string;
  wasEdited: boolean;
  category?: ResearchCategory;
  qualityScore?: number;
  viralMetrics?: ViralMetrics;
  configName?: string | null;
  launchedDebateId?: string | null;
}

export interface ResearchConfig {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  categories: ResearchCategory[];
  perplexityModel: string;
  maxTopicsPerRun: number;
  minControversyScore: number;
  minTrendAlignment: number;
  createdAt: string;
  updatedAt: string;
}

export interface TopicPreScreenResult {
  researchResultId: string;
  topic: string;
  category: ResearchCategory;
  estimatedTrendAlignment: number;
  matchedTrends: string[];
  controversyScore: number;
  passesThreshold: boolean;
  reason?: string;
}

export interface DashboardStats {
  pendingProposals: number;
  approvedProposals: number;
  rejectedProposals: number;
  scheduledProposals: number;
  recentJobsCount: number;
  totalTopicsDiscovered: number;
  totalEpisodesGenerated: number;
}

export interface ResearchSource {
  url: string;
  title: string;
  domain: string;
  publishedAt?: string;
  excerpt: string;
  credibilityScore?: number;

  // Source management fields
  enabled?: boolean;
  customAdded?: boolean;
  addedBy?: string;
  addedAt?: string;
}

export interface ResearchResult {
  id: string;
  jobId: string;
  topic: string;
  category: ResearchCategory;
  sources: ResearchSource[];
  summary: string;
  controversyScore: number;
  timeliness: number;
  depth: number;
  rawPerplexityResponse: string;
  createdAt: string;

  // Indexing metadata
  indexedAt?: string;
  indexedChunkCount?: number;
  indexingError?: string;
}

export const CATEGORY_LABELS: Record<ResearchCategory, string> = {
  technology_ethics: 'Technology & Ethics',
  climate_environment: 'Climate & Environment',
  politics_governance: 'Politics & Governance',
  bioethics_medicine: 'Bioethics & Medicine',
  economics_inequality: 'Economics & Inequality',
  ai_automation: 'AI & Automation',
  social_justice: 'Social Justice',
  international_relations: 'International Relations',
  privacy_surveillance: 'Privacy & Surveillance',
  education_culture: 'Education & Culture',
};
