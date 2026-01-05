
import { Router } from 'express';
import { ResearchJobScheduler } from '../services/research/research-job-scheduler.js';
import { ResearchRepository } from '../db/repositories/research-repository.js';

export function createResearchRoutes(
    scheduler: ResearchJobScheduler,
    researchRepo: ResearchRepository
): Router {
    const router = Router();

    // Get all research configs
    router.get('/configs', async (req, res) => {
        try {
            const configs = await researchRepo.findAllConfigs();
            res.json(configs);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create research config
    router.post('/configs', async (req, res) => {
        try {
            const config = await researchRepo.createConfig(req.body);
            scheduler.scheduleConfig(config);
            res.status(201).json(config);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    // Update research config
    router.put('/configs/:id', async (req, res) => {
        try {
            await researchRepo.updateConfig(req.params.id, req.body);
            const updated = await researchRepo.findConfigById(req.params.id);
            if (updated) {
                scheduler.scheduleConfig(updated);
            }
            res.json(updated);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    // Delete research config
    router.delete('/configs/:id', async (req, res) => {
        try {
            scheduler.unscheduleConfig(req.params.id);
            await researchRepo.deleteConfig(req.params.id);
            res.status(204).send();
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    // Get all research jobs
    router.get('/jobs', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit as string) || 20;
            const jobs = await researchRepo.findRecentJobs(limit);
            res.json(jobs);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // Trigger manual job run
    router.post('/jobs/run', async (req, res) => {
        try {
            const { configId } = req.body;

            if (!configId) {
                return res.status(400).json({ error: 'configId is required' });
            }

            const job = await scheduler.runJob(configId);
            res.status(202).json(job);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    // Get job status
    router.get('/jobs/:id', async (req, res) => {
        try {
            const job = await researchRepo.findJobById(req.params.id);
            if (!job) {
                return res.status(404).json({ error: 'Job not found' });
            }
            res.json(job);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get scheduler status
    router.get('/scheduler/status', (req, res) => {
        res.json({
            isRunning: scheduler.isJobRunning(),
            activeJobs: scheduler.getActiveJobs(),
            schedules: scheduler.getScheduleStatus(),
        });
    });

    return router;
}
