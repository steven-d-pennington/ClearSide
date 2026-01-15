
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

export interface ResearchConfig {
    id: string;
    name: string;
    schedule: string;                    // Cron expression
    enabled: boolean;
    categories: ResearchCategory[];
    perplexityModel: string;             // e.g., "perplexity/sonar-pro"
    maxTopicsPerRun: number;
    minControversyScore: number;         // 0-1, filter boring topics
    minTrendAlignment: number;           // 0-1, filter topics not aligned with trends
    searchQueries: string[];             // Custom research prompts
    excludeTopics: string[];             // Topics to avoid
    viralMode: boolean;                  // Enable aggressive clickbait/engagement optimization
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Pre-screening result for a research topic
 * Used to decide whether to generate a full proposal
 */
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

export interface ResearchJob {
    id: string;
    configId: string;
    status: ResearchJobStatus;
    startedAt?: Date;
    completedAt?: Date;
    topicsDiscovered: number;
    episodesGenerated: number;
    tokensUsed: number;
    error?: string;
    createdAt: Date;
}

export interface ResearchSource {
    url: string;
    title: string;
    domain: string;
    publishedAt?: Date;
    excerpt: string;
    credibilityScore?: number;           // Optional: domain reputation

    // Source management fields
    enabled?: boolean;                   // Default true; false = exclude from indexing
    customAdded?: boolean;               // True if manually added by user
    addedBy?: string;                    // User who added custom source
    addedAt?: Date;                      // When custom source was added
}

export interface ResearchResult {
    id: string;
    jobId: string;
    topic: string;
    category: ResearchCategory;
    sources: ResearchSource[];
    summary: string;
    controversyScore: number;            // 0-1, how debatable is this?
    timeliness: number;                  // 0-1, how current?
    depth: number;                       // 0-1, enough for episode?
    rawPerplexityResponse: string;
    createdAt: Date;

    // Indexing metadata
    indexedAt?: Date;                    // When sources were last indexed
    indexedChunkCount?: number;          // Number of chunks indexed
    indexingError?: string;              // Error message if indexing failed
}

export interface PhilosophicalChair {
    name: string;                        // e.g., "Utilitarian Chair"
    position: string;                    // Main argument
    mustAcknowledge: string;             // Required self-critique
}

export interface EpisodeEdit {
    field: string;
    oldValue: string;
    newValue: string;
    editedAt: Date;
    editedBy: string;
}

export interface EpisodeProposal {
    id: string;
    researchResultId: string;
    status: ProposalStatus;

    // Episode content (matches duelogic-season1-episodes.md format)
    episodeNumber?: number;              // Assigned on approval
    title: string;                       // e.g., "The Algorithm's Gavel"
    subtitle: string;                    // e.g., "Can Code Be Fairer Than Conscience?"
    description: string;                 // Compelling 2-3 sentence hook
    proposition: string;                 // Clear binary debate proposition
    contextForPanel: string;             // Background for AI debaters

    chairs: PhilosophicalChair[];
    keyTensions: string[];

    // Metadata
    generatedAt: Date;
    reviewedAt?: Date;
    reviewedBy?: string;
    scheduledFor?: Date;
    adminNotes?: string;

    // Edits tracking
    wasEdited: boolean;
    editHistory?: EpisodeEdit[];

    // Viral optimization metrics
    viralMetrics?: ViralMetrics;
}

/**
 * Viral optimization metrics for episode proposals
 * Tracks how well the episode aligns with trending topics and engagement patterns
 */
export interface ViralMetrics {
    /** 0-1 score of how well the topic aligns with current trends */
    trendAlignment: number;
    /** 0-1 score of predicted title click appeal */
    titleHookStrength: number;
    /** 0-1 score of controversy balance (debatable but not toxic) */
    controversyBalance: number;
    /** Suggested hashtags for social promotion */
    suggestedHashtags: string[];
    /** Target audience description */
    targetAudience: string;
    /** Trending terms this episode connects to */
    matchedTrends: string[];
    /** Title pattern used (e.g., "Compound Mystery", "Provocative Question") */
    titlePattern?: string;
}

// Quality thresholds for filtering research results
export interface QualityThresholds {
    minControversyScore: number;
    minTimeliness: number;
    minDepth: number;
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
    minControversyScore: 0.65,
    minTimeliness: 0.4,
    minDepth: 0.7,
};

// Research config defaults
export const DEFAULT_RESEARCH_CONFIG: Partial<ResearchConfig> = {
    perplexityModel: 'perplexity/sonar-pro',
    maxTopicsPerRun: 20,
    minControversyScore: 0.6,
    minTrendAlignment: 0.1,              // 10% minimum trend alignment (0 = disabled)
    enabled: true,
    viralMode: false,                    // Set true for aggressive engagement optimization
    categories: [
        'technology_ethics',
        'climate_environment',
        'bioethics_medicine',
        'ai_automation',
        'economics_inequality',
    ],
};
