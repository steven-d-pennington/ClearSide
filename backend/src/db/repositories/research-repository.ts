
import { Pool } from 'pg';
import {
    ResearchConfig,
    ResearchJob,
    ResearchResult,
} from '../../types/duelogic-research.js';

export class ResearchRepository {
    constructor(private pool: Pool) { }

    // ========== Research Config Operations ==========

    async createConfig(config: Omit<ResearchConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ResearchConfig> {
        const result = await this.pool.query(`
      INSERT INTO research_configs (
        name, schedule, enabled, categories, perplexity_model,
        max_topics_per_run, min_controversy_score, min_trend_alignment, search_queries, exclude_topics, viral_mode
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
            config.name,
            config.schedule,
            config.enabled,
            config.categories,
            config.perplexityModel,
            config.maxTopicsPerRun,
            config.minControversyScore,
            config.minTrendAlignment ?? 0.1,
            config.searchQueries,
            config.excludeTopics,
            config.viralMode ?? false
        ]);

        return this.mapConfigRow(result.rows[0]);
    }

    async findConfigById(id: string): Promise<ResearchConfig | null> {
        const result = await this.pool.query(`
      SELECT * FROM research_configs WHERE id = $1
    `, [id]);

        return result.rows[0] ? this.mapConfigRow(result.rows[0]) : null;
    }

    async findAllConfigs(): Promise<ResearchConfig[]> {
        const result = await this.pool.query(`
      SELECT * FROM research_configs ORDER BY created_at DESC
    `);

        return result.rows.map(row => this.mapConfigRow(row));
    }

    async findEnabledConfigs(): Promise<ResearchConfig[]> {
        const result = await this.pool.query(`
      SELECT * FROM research_configs WHERE enabled = true ORDER BY created_at DESC
    `);

        return result.rows.map(row => this.mapConfigRow(row));
    }

    async updateConfig(id: string, updates: Partial<ResearchConfig>): Promise<void> {
        const fields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (updates.name !== undefined) {
            fields.push(`name = $${paramIndex++}`);
            values.push(updates.name);
        }
        if (updates.schedule !== undefined) {
            fields.push(`schedule = $${paramIndex++}`);
            values.push(updates.schedule);
        }
        if (updates.enabled !== undefined) {
            fields.push(`enabled = $${paramIndex++}`);
            values.push(updates.enabled);
        }
        if (updates.categories !== undefined) {
            fields.push(`categories = $${paramIndex++}`);
            values.push(updates.categories);
        }
        if (updates.perplexityModel !== undefined) {
            fields.push(`perplexity_model = $${paramIndex++}`);
            values.push(updates.perplexityModel);
        }
        if (updates.maxTopicsPerRun !== undefined) {
            fields.push(`max_topics_per_run = $${paramIndex++}`);
            values.push(updates.maxTopicsPerRun);
        }
        if (updates.minControversyScore !== undefined) {
            fields.push(`min_controversy_score = $${paramIndex++}`);
            values.push(updates.minControversyScore);
        }
        if (updates.minTrendAlignment !== undefined) {
            fields.push(`min_trend_alignment = $${paramIndex++}`);
            values.push(updates.minTrendAlignment);
        }
        if (updates.searchQueries !== undefined) {
            fields.push(`search_queries = $${paramIndex++}`);
            values.push(updates.searchQueries);
        }
        if (updates.excludeTopics !== undefined) {
            fields.push(`exclude_topics = $${paramIndex++}`);
            values.push(updates.excludeTopics);
        }
        if (updates.viralMode !== undefined) {
            fields.push(`viral_mode = $${paramIndex++}`);
            values.push(updates.viralMode);
        }

        if (fields.length === 0) return;

        values.push(id);
        await this.pool.query(`
      UPDATE research_configs SET ${fields.join(', ')} WHERE id = $${paramIndex}
    `, values);
    }

    async deleteConfig(id: string): Promise<void> {
        await this.pool.query(`DELETE FROM research_configs WHERE id = $1`, [id]);
    }

    // ========== Research Job Operations ==========

    async createJob(configId: string): Promise<ResearchJob> {
        const result = await this.pool.query(`
      INSERT INTO research_jobs (config_id)
      VALUES ($1)
      RETURNING *
    `, [configId]);

        return this.mapJobRow(result.rows[0]);
    }

    async findJobById(id: string): Promise<ResearchJob | null> {
        const result = await this.pool.query(`
      SELECT * FROM research_jobs WHERE id = $1
    `, [id]);

        return result.rows[0] ? this.mapJobRow(result.rows[0]) : null;
    }

    async findJobsByConfigId(configId: string): Promise<ResearchJob[]> {
        const result = await this.pool.query(`
      SELECT * FROM research_jobs WHERE config_id = $1 ORDER BY created_at DESC
    `, [configId]);

        return result.rows.map(row => this.mapJobRow(row));
    }

    async findRecentJobs(limit: number = 10): Promise<ResearchJob[]> {
        const result = await this.pool.query(`
      SELECT * FROM research_jobs ORDER BY created_at DESC LIMIT $1
    `, [limit]);

        return result.rows.map(row => this.mapJobRow(row));
    }

    async startJob(id: string): Promise<void> {
        await this.pool.query(`
      UPDATE research_jobs
      SET status = 'running', started_at = NOW()
      WHERE id = $1
    `, [id]);
    }

    async completeJob(
        id: string,
        topicsDiscovered: number,
        episodesGenerated: number,
        tokensUsed: number
    ): Promise<void> {
        await this.pool.query(`
      UPDATE research_jobs
      SET status = 'completed', completed_at = NOW(),
          topics_discovered = $1, episodes_generated = $2, tokens_used = $3
      WHERE id = $4
    `, [topicsDiscovered, episodesGenerated, tokensUsed, id]);
    }

    async failJob(id: string, error: string): Promise<void> {
        await this.pool.query(`
      UPDATE research_jobs
      SET status = 'failed', completed_at = NOW(), error = $1
      WHERE id = $2
    `, [error, id]);
    }

    // ========== Research Result Operations ==========

    async createResult(result: Omit<ResearchResult, 'id' | 'createdAt'>): Promise<ResearchResult> {
        const dbResult = await this.pool.query(`
      INSERT INTO research_results (
        job_id, topic, category, sources, summary,
        controversy_score, timeliness, depth, raw_perplexity_response
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
            result.jobId,
            result.topic,
            result.category,
            JSON.stringify(result.sources),
            result.summary,
            result.controversyScore,
            result.timeliness,
            result.depth,
            result.rawPerplexityResponse
        ]);

        return this.mapResultRow(dbResult.rows[0]);
    }

    async findResultById(id: string): Promise<ResearchResult | null> {
        const result = await this.pool.query(`
      SELECT * FROM research_results WHERE id = $1
    `, [id]);

        return result.rows[0] ? this.mapResultRow(result.rows[0]) : null;
    }

    async findResultsByJobId(jobId: string): Promise<ResearchResult[]> {
        const result = await this.pool.query(`
      SELECT * FROM research_results WHERE job_id = $1 ORDER BY created_at DESC
    `, [jobId]);

        return result.rows.map(row => this.mapResultRow(row));
    }

    async findHighQualityResults(minControversy: number, minDepth: number): Promise<ResearchResult[]> {
        const result = await this.pool.query(`
      SELECT * FROM research_results
      WHERE controversy_score >= $1 AND depth >= $2
      ORDER BY controversy_score DESC, depth DESC
    `, [minControversy, minDepth]);

        return result.rows.map(row => this.mapResultRow(row));
    }

    // ========== Source Management Methods ==========

    /**
     * Find research result with sources (alias for findResultById with clearer intent)
     */
    async findResultWithSources(id: string): Promise<ResearchResult | null> {
        const result = await this.pool.query(`
      SELECT * FROM research_results WHERE id = $1
    `, [id]);

        return result.rows[0] ? this.mapResultRow(result.rows[0]) : null;
    }

    /**
     * Update sources for a research result
     */
    async updateSources(
        resultId: string,
        sources: any[],
        _updatedBy: string
    ): Promise<void> {
        await this.pool.query(`
      UPDATE research_results
      SET sources = $1
      WHERE id = $2
    `, [JSON.stringify(sources), resultId]);
    }

    /**
     * Update indexing metadata after indexing sources
     */
    async updateIndexingMetadata(
        resultId: string,
        indexedAt: Date,
        chunkCount: number,
        error?: string
    ): Promise<void> {
        await this.pool.query(`
      UPDATE research_results
      SET indexed_at = $1,
          indexed_chunk_count = $2,
          indexing_error = $3
      WHERE id = $4
    `, [indexedAt, chunkCount, error || null, resultId]);
    }

    // ========== Row Mappers ==========

    private mapConfigRow(row: any): ResearchConfig {
        return {
            id: row.id,
            name: row.name,
            schedule: row.schedule,
            enabled: row.enabled,
            categories: row.categories,
            perplexityModel: row.perplexity_model,
            maxTopicsPerRun: row.max_topics_per_run,
            minControversyScore: row.min_controversy_score,
            minTrendAlignment: row.min_trend_alignment ?? 0.1,
            searchQueries: row.search_queries || [],
            excludeTopics: row.exclude_topics || [],
            viralMode: row.viral_mode ?? false,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    private mapJobRow(row: any): ResearchJob {
        return {
            id: row.id,
            configId: row.config_id,
            status: row.status,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            topicsDiscovered: row.topics_discovered,
            episodesGenerated: row.episodes_generated,
            tokensUsed: row.tokens_used,
            error: row.error,
            createdAt: row.created_at,
        };
    }

    private mapResultRow(row: any): ResearchResult {
        return {
            id: row.id,
            jobId: row.job_id,
            topic: row.topic,
            category: row.category,
            sources: row.sources,
            summary: row.summary,
            controversyScore: row.controversy_score,
            timeliness: row.timeliness,
            depth: row.depth,
            rawPerplexityResponse: row.raw_perplexity_response,
            createdAt: row.created_at,
            indexedAt: row.indexed_at,
            indexedChunkCount: row.indexed_chunk_count,
            indexingError: row.indexing_error,
        };
    }
}
