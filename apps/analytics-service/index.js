const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

let stats = {
    totalCreated: 0,
    byType: {}
};

// Event handler
app.post('/events', (req, res) => {
    const { eventType, data } = req.body;
    console.log(`[Analytics Service] Processing event: ${eventType}`);

    if (eventType === 'RESOURCE_CREATED') {
        stats.totalCreated++;
        const type = data.type || 'unknown';
        stats.byType[type] = (stats.byType[type] || 0) + 1;
    }

    res.send({ status: 'OK' });
});

app.get('/stats', (req, res) => {
    res.send(stats);
});

const PORT = 4002;
app.listen(PORT, async () => {
    console.log(`[Analytics Service] Listening on port ${PORT}`);

    // Register subscription
    try {
        await axios.post('http://localhost:4005/subscribe', {
            eventType: 'RESOURCE_CREATED',
            url: 'http://localhost:4002/events'
        });
        console.log('[Analytics Service] Subscribed to RESOURCE_CREATED');
    } catch (err) {
        console.warn('[Analytics Service] Failed to subscribe to Event Bus. Is it running?');
    }
});
