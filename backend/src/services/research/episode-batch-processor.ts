
import { EpisodeGenerator } from './episode-generator.js';
import { ResearchRepository } from '../../db/repositories/research-repository.js';
import { ResearchResult, EpisodeProposal } from '../../types/duelogic-research.js';
import pino from 'pino';

const logger = pino({
    name: 'episode-batch-processor',
    level: process.env.LOG_LEVEL || 'info',
});

interface BatchResult {
    totalProcessed: number;
    proposalsGenerated: number;
    errors: number;
    proposals: EpisodeProposal[];
}

export class EpisodeBatchProcessor {
    constructor(
        private generator: EpisodeGenerator,
        private researchRepo: ResearchRepository
    ) { }

    /**
     * Process all high-quality research results from a job
     */
    async processJob(jobId: string, maxEpisodes: number = 15): Promise<BatchResult> {
        const results = await this.researchRepo.findResultsByJobId(jobId);

        return this.processResults(results, maxEpisodes);
    }

    /**
     * Process a batch of research results
     */
    async processResults(
        results: ResearchResult[],
        maxEpisodes: number = 15
    ): Promise<BatchResult> {
        const batch: BatchResult = {
            totalProcessed: 0,
            proposalsGenerated: 0,
            errors: 0,
            proposals: [],
        };

        // Sort by combined quality score
        const sorted = [...results].sort((a, b) => {
            const scoreA = a.controversyScore * a.depth * a.timeliness;
            const scoreB = b.controversyScore * b.depth * b.timeliness;
            return scoreB - scoreA;
        });

        for (const result of sorted) {
            if (batch.proposalsGenerated >= maxEpisodes) break;

            batch.totalProcessed++;

            try {
                const proposal = await this.generator.generateProposal(result);

                if (proposal) {
                    batch.proposalsGenerated++;
                    batch.proposals.push(proposal);
                    logger.info({ title: proposal.title }, 'Generated proposal');
                }
            } catch (error) {
                batch.errors++;
                logger.error({ err: error, topic: result.topic }, 'Failed to process research result');
            }

            // Small delay to avoid rate limiting
            await this.delay(1000);
        }

        return batch;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
