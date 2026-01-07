
import { Pool } from 'pg';
import {
    EpisodeProposal,
    ProposalStatus,
    EpisodeEdit
} from '../../types/duelogic-research.js';

export class EpisodeProposalRepository {
    constructor(private pool: Pool) { }

    async create(proposal: Omit<EpisodeProposal, 'id' | 'generatedAt' | 'wasEdited'>): Promise<EpisodeProposal> {
        const result = await this.pool.query(`
      INSERT INTO episode_proposals (
        research_result_id, status, title, subtitle, description,
        proposition, context_for_panel, chairs, key_tensions
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
            proposal.researchResultId,
            proposal.status || 'pending',
            proposal.title,
            proposal.subtitle,
            proposal.description,
            proposal.proposition,
            proposal.contextForPanel,
            JSON.stringify(proposal.chairs),
            proposal.keyTensions
        ]);

        return this.mapRow(result.rows[0]);
    }

    async findById(id: string): Promise<EpisodeProposal | null> {
        const result = await this.pool.query(`
      SELECT * FROM episode_proposals WHERE id = $1
    `, [id]);

        return result.rows[0] ? this.mapRow(result.rows[0]) : null;
    }

    async findByStatus(status: ProposalStatus): Promise<EpisodeProposal[]> {
        const result = await this.pool.query(`
      SELECT * FROM episode_proposals WHERE status = $1 ORDER BY generated_at DESC
    `, [status]);

        return result.rows.map(row => this.mapRow(row));
    }

    async findPending(): Promise<EpisodeProposal[]> {
        return this.findByStatus('pending');
    }

    async findApproved(): Promise<EpisodeProposal[]> {
        const result = await this.pool.query(`
      SELECT * FROM episode_proposals
      WHERE status IN ('approved', 'scheduled')
      ORDER BY scheduled_for ASC NULLS LAST, generated_at DESC
    `);

        return result.rows.map(row => this.mapRow(row));
    }

    async approve(id: string, reviewedBy: string, episodeNumber?: number): Promise<void> {
        await this.pool.query(`
      UPDATE episode_proposals
      SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1, episode_number = $2
      WHERE id = $3
    `, [reviewedBy, episodeNumber, id]);
    }

    async reject(id: string, reviewedBy: string, adminNotes?: string): Promise<void> {
        await this.pool.query(`
      UPDATE episode_proposals
      SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $1, admin_notes = $2
      WHERE id = $3
    `, [reviewedBy, adminNotes, id]);
    }

    async schedule(id: string, scheduledFor: Date): Promise<void> {
        await this.pool.query(`
      UPDATE episode_proposals
      SET status = 'scheduled', scheduled_for = $1
      WHERE id = $2
    `, [scheduledFor, id]);
    }

    async updateStatus(id: string, status: ProposalStatus): Promise<void> {
        await this.pool.query(`
      UPDATE episode_proposals
      SET status = $1
      WHERE id = $2
    `, [status, id]);
    }

    async updateContent(
        id: string,
        updates: Partial<Pick<EpisodeProposal, 'title' | 'subtitle' | 'description' | 'proposition' | 'contextForPanel' | 'chairs' | 'keyTensions'>>,
        editedBy: string
    ): Promise<void> {
        // First, get current values for edit history
        const current = await this.findById(id);
        if (!current) throw new Error(`Proposal ${id} not found`);

        const editHistory: EpisodeEdit[] = current.editHistory || [];
        const now = new Date();

        // Track changes
        for (const [key, newValue] of Object.entries(updates)) {
            const oldValue = (current as any)[key];
            // Simple string comparison for now, assuming primitives or simple objects
            const oldStr = typeof oldValue === 'object' ? JSON.stringify(oldValue) : String(oldValue);
            const newStr = typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue);

            if (oldStr !== newStr) {
                editHistory.push({
                    field: key,
                    oldValue: oldStr,
                    newValue: newStr,
                    editedAt: now,
                    editedBy,
                });
            }
        }

        const fields: string[] = ['was_edited = true', 'edit_history = $1'];
        const values: any[] = [JSON.stringify(editHistory)];
        let paramIndex = 2;

        if (updates.title !== undefined) {
            fields.push(`title = $${paramIndex++}`);
            values.push(updates.title);
        }
        if (updates.subtitle !== undefined) {
            fields.push(`subtitle = $${paramIndex++}`);
            values.push(updates.subtitle);
        }
        if (updates.description !== undefined) {
            fields.push(`description = $${paramIndex++}`);
            values.push(updates.description);
        }
        if (updates.proposition !== undefined) {
            fields.push(`proposition = $${paramIndex++}`);
            values.push(updates.proposition);
        }
        if (updates.contextForPanel !== undefined) {
            fields.push(`context_for_panel = $${paramIndex++}`);
            values.push(updates.contextForPanel);
        }
        if (updates.chairs !== undefined) {
            fields.push(`chairs = $${paramIndex++}`);
            values.push(JSON.stringify(updates.chairs));
        }
        if (updates.keyTensions !== undefined) {
            fields.push(`key_tensions = $${paramIndex++}`);
            values.push(updates.keyTensions);
        }

        values.push(id);
        await this.pool.query(`
      UPDATE episode_proposals SET ${fields.join(', ')} WHERE id = $${paramIndex}
    `, values);
    }

    async setAdminNotes(id: string, notes: string): Promise<void> {
        await this.pool.query(`
      UPDATE episode_proposals SET admin_notes = $1 WHERE id = $2
    `, [notes, id]);
    }

    async bulkApprove(ids: string[], reviewedBy: string): Promise<void> {
        await this.pool.query(`
      UPDATE episode_proposals
      SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1
      WHERE id = ANY($2)
    `, [reviewedBy, ids]);
    }

    async bulkReject(ids: string[], reviewedBy: string): Promise<void> {
        await this.pool.query(`
      UPDATE episode_proposals
      SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $1
      WHERE id = ANY($2)
    `, [reviewedBy, ids]);
    }

    async getNextEpisodeNumber(): Promise<number> {
        const result = await this.pool.query(`
      SELECT COALESCE(MAX(episode_number), 0) + 1 as next_number
      FROM episode_proposals
      WHERE episode_number IS NOT NULL
    `);

        return result.rows[0].next_number;
    }

    async getStats(): Promise<{ pending: number; approved: number; rejected: number; scheduled: number }> {
        const result = await this.pool.query(`
      SELECT status, COUNT(*) as count
      FROM episode_proposals
      GROUP BY status
    `);

        const stats = { pending: 0, approved: 0, rejected: 0, scheduled: 0 };
        for (const row of result.rows) {
            stats[row.status as keyof typeof stats] = parseInt(row.count);
        }
        return stats;
    }

    private mapRow(row: any): EpisodeProposal {
        return {
            id: row.id,
            researchResultId: row.research_result_id,
            status: row.status,
            episodeNumber: row.episode_number,
            title: row.title,
            subtitle: row.subtitle,
            description: row.description,
            proposition: row.proposition,
            contextForPanel: row.context_for_panel,
            chairs: row.chairs,
            keyTensions: row.key_tensions,
            generatedAt: row.generated_at,
            reviewedAt: row.reviewed_at,
            reviewedBy: row.reviewed_by,
            scheduledFor: row.scheduled_for,
            adminNotes: row.admin_notes,
            wasEdited: row.was_edited,
            editHistory: row.edit_history,
        };
    }
}
