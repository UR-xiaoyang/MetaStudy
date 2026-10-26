import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { aiStatus } from '../ai.js';

const router = Router();
router.use(authMiddleware);

/**
 * LLM 能力与成本概览：未配置时 configured=false 并给出原因。
 */
router.get('/status', (req, res) => {
  const usage = db
    .prepare(
      `SELECT feature,
              COUNT(*) AS calls,
              COALESCE(SUM(success), 0) AS ok,
              COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
              COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
              COALESCE(SUM(cost), 0) AS cost,
              COALESCE(ROUND(AVG(latency_ms)), 0) AS avg_latency_ms
         FROM llm_calls
        WHERE created_at >= datetime('now', '-7 days')
        GROUP BY feature
        ORDER BY calls DESC`
    )
    .all();

  res.json({
    ...aiStatus(),
    usage7d: usage,
    totalCost7d: Number(usage.reduce((sum, row) => sum + Number(row.cost || 0), 0).toFixed(6))
  });
});

export default router;
