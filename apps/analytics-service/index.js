const express = require('express');
const { db } = require('@team-mgmt/shared');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

/**
 * High-performance aggregation endpoint.
 * Directly queries the Materialized View for instant dashboard data.
 */
app.get('/stats', async (req, res) => {
    try {
        const result = await db.queryCore('SELECT * FROM core.dashboard_analytics_summary');

        if (result.rows.length === 0) {
            return res.send({
                avg_utilization: 0,
                bench_count: 0,
                monthly_utilization: []
            });
        }

        res.send(result.rows[0]);
    } catch (error) {
        console.error('[Analytics Service Error]', error);
        res.status(500).send({ error: 'Internal server error fetching analytics' });
    }
});

const PORT = 4002;
app.listen(PORT, () => {
    console.log(`[Analytics Service] Listening on port ${PORT}`);
});
