const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');  // Import CORS middleware

const app = express();

// Use CORS middleware with specific origin
app.use(cors({
  origin: 'https://www.sportdogfood.com',  // Replace this with the domain you want to allow
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Webflow API endpoint on Heroku
app.post('/webflow', async (req, res) => {
    const { fieldData } = req.body;

    // Define the headers and body for the Webflow API
    const headers = {
        'accept': 'application/json',
        'authorization': 'Bearer 8c21ecbc5b6e67c61d84ca6f3798ecf88e2cb453f8fc0312945b29d45f1d873e',
        'content-type': 'application/json'
    };

    const body = {
        isArchived: false,
        isDraft: false,
        fieldData: {
            name: fieldData.name
        }
    };

    try {
        // Send POST request to Webflow API
        const response = await fetch('https://api.webflow.com/v2/collections/647ddb9037101ce399b331bb/items', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        const data = await response.json();

        // Log and return the response
        console.log('Webflow API Response:', data);
        res.json(data);
    } catch (error) {
        console.error('Error sending data to Webflow API:', error);
        res.status(500).json({ error: 'Error sending data to Webflow API' });
    }
});
app.get('/', (req, res) => {
  res.send('App is running.');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
