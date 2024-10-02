const express = require('express');
const fetch = require('node-fetch');
const app = express();

let zohoAccessToken = '';
let zohoRefreshToken = process.env.ZOHO_REFRESH_TOKEN; // Stored in Heroku environment
let clientId = process.env.ZOHO_CLIENT_ID;
let clientSecret = process.env.ZOHO_CLIENT_SECRET;

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Function to refresh the Zoho access token
async function refreshZohoToken() {
  const refreshUrl = 'https://accounts.zoho.com/oauth/v2/token';

  try {
    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: zohoRefreshToken,
        client_id: clientId,
        client_secret: clientSecret
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

// Zoho CRM API proxy route with token handling
app.get('/zoho/Contacts/search', async (req, res) => {
  const criteria = req.query.criteria || '';  // Fetch the criteria from query parameters
  const apiUrl = `https://www.zohoapis.com/crm/v2/Contacts/search?criteria=${criteria}`;

  try {
    // Make Zoho API request using the access token
    let response = await fetch(apiUrl, {
      headers: { 'Authorization': `Zoho-oauthtoken ${zohoAccessToken}` }
    });

    // If the token is expired (401), refresh it and retry the request
    if (response.status === 401) {
      console.log('Access token expired, refreshing...');
      await refreshZohoToken();
      
      // Retry the Zoho API request with the new token
      response = await fetch(apiUrl, {
        headers: { 'Authorization': `Zoho-oauthtoken ${zohoAccessToken}` }
      });
    }

    if (!response.ok) {
      throw new Error(`Zoho API Error: ${response.statusText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching Zoho data:", error);
    res.status(500).json({ error: 'Error fetching Zoho data' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
