import { Router } from 'express';
import { config } from '../../config';
import { logger } from '../../config/logger';
import { llmService } from '../../services/llm.service';

const router = Router();

/**
 * Health check for the configured LLM provider (OpenRouter or Ollama).
 */
router.get('/health', async (req, res) => {
    try {
        const provider = config.ai.llmProvider;
        const isHealthy = await llmService.healthCheck();

        if (isHealthy) {
            res.json({
                status: 'ok',
                service: provider,
                ...(provider === 'openrouter'
                    ? { model: config.ai.openRouterModel }
                    : {
                          baseUrl: config.ai.ollamaBaseUrl,
                          model: config.ai.ollamaModel,
                      }),
            });
        } else {
            res.status(503).json({
                status: 'unavailable',
                service: provider,
                message:
                    provider === 'openrouter'
                        ? 'OpenRouter is not accessible — check OPENROUTER_API_KEY'
                        : 'Ollama service is not accessible',
            });
        }
    } catch (error) {
        logger.error('LLM health check failed', { error });
        res.status(500).json({
            status: 'error',
            message: 'Failed to check LLM service health',
        });
    }
});

/**
 * Test LLM generation
 */
router.post('/test', async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const response = await llmService.generate(prompt);

        res.json({
            success: true,
            provider: config.ai.llmProvider,
            prompt,
            response,
        });
    } catch (error) {
        logger.error('LLM test failed', { error });
        res.status(500).json({
            error: 'Failed to generate LLM response',
        });
    }
});

export const llmRoutes = router;
