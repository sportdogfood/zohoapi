const express = require('express');
const fetch = require('node-fetch');
const app = express();

let zohoRefreshToken = '1000.643f6fe53deb2882d71464cb6ef6e194.d794ad0786ae77082182e4e289d6b58c'; // Replace with your Zoho refresh token
let zohoAccessToken = '1000.3f4286f9f3ccf81824700c329d56dbe0.ec1de5ec479aa6a1963c00347a60c059'; // Store the access token here

app.use(express.json()); // Middleware to parse JSON bodies

// ------------------------------------------------------
// Function to refresh the Zoho access token
async function refreshZohoToken() {
  const refreshUrl = 'https://accounts.zoho.com/oauth/v2/token';

  try {
    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: zohoRefreshToken, // Use stored refresh token
        client_id: '1000.3VZRY3CC9QGZBXA8IZZ6TWZTZV1H6H', // Replace with your Zoho client ID
        client_secret: '48dcd0b587246976e9dfcfcc54b10bfb211686cbe4' // Replace with your Zoho client secret
      })
    });

    const data = await response.json();

    if (data.access_token) {
      zohoAccessToken = data.access_token;
      console.log('Zoho Access Token Refreshed:', zohoAccessToken);
      return zohoAccessToken;
    } else {
      throw new Error('Failed to refresh Zoho token');
    }
  } catch (error) {
    console.error('Error refreshing Zoho access token:', error);
    throw error;
  }
}

// ------------------------------------------------------
// Refresh token route
app.post('/zoho/token/refresh', async (req, res) => {
  try {
    const token = await refreshZohoToken();
    res.json({ access_token: token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh Zoho token' });
  }
});

// ------------------------------------------------------
// Proxy route to Zoho API
app.all('/zoho/:endpoint*', async (req, res) => {
  const endpoint = req.params.endpoint;
  const apiUrl = `https://www.zohoapis.com/crm/v2/${endpoint}`;

  try {
    const response = await fetch(apiUrl, {
      method: req.method,
      headers: {
        'Authorization': `Zoho-oauthtoken ${zohoAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: req.method === 'POST' || req.method === 'PUT' ? JSON.stringify(req.body) : undefined
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.log('Token expired, refreshing...');
        await refreshZohoToken();
        return res.status(401).json({ error: 'Access token expired. Please refresh.' });
      }
      throw new Error(`Zoho API Error: ${response.statusText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching from Zoho API' });
  }
});

// ------------------------------------------------------
// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
