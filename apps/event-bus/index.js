const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

const subscriptions = {};

// Subscribe to events
app.post('/subscribe', (req, res) => {
    const { eventType, url } = req.body;
    if (!subscriptions[eventType]) {
        subscriptions[eventType] = [];
    }
    if (!subscriptions[eventType].includes(url)) {
        subscriptions[eventType].push(url);
        console.log(`[Event Bus] Subscribed ${url} to ${eventType}`);
    }
    res.status(200).send({ status: 'OK' });
});

// Emit events
app.post('/emit', async (req, res) => {
    const { eventType, data } = req.body;
    console.log(`[Event Bus] Received event: ${eventType}`);

    const subscribers = subscriptions[eventType] || [];
    const notifications = subscribers.map(url => {
        return axios.post(url, { eventType, data }).catch(err => {
            console.error(`[Event Bus] Error notifying ${url}:`, err.message);
        });
    });

    await Promise.all(notifications);
    res.status(200).send({ status: 'OK' });
});

const PORT = 4005;
app.listen(PORT, () => {
    console.log(`[Event Bus] Listening on port ${PORT}`);
});
