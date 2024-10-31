// server.js
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();

let zohoAccessToken = '';
let zohoRefreshToken = process.env.ZOHO_REFRESH_TOKEN;
let clientId = process.env.ZOHO_CLIENT_ID;
let clientSecret = process.env.ZOHO_CLIENT_SECRET;

// Middleware to enable CORS for all requests
app.use(cors({
  origin: '*', // Specify specific origins in production
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests
app.options('*', cors());

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

// Helper function to handle Zoho API requests and token refresh
async function handleZohoApiRequest(apiUrl, res, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: { 
        'Authorization': `Zoho-oauthtoken ${zohoAccessToken}`,
        'Content-Type': 'application/json'
      }
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    let response = await fetch(apiUrl, options);

    // Handle unauthorized (expired token)
    if (response.status === 401) {
      console.log('Access token expired, refreshing...');
      await refreshZohoToken();
      options.headers['Authorization'] = `Zoho-oauthtoken ${zohoAccessToken}`;
      response = await fetch(apiUrl, options);
    }

    if (!response.ok) {
      const errorResponse = await response.json();
      console.error(`Zoho API Error: ${response.statusText}`, errorResponse);
      return res.status(response.status).json({ error: response.statusText, details: errorResponse });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("Error fetching Zoho data:", error);
    return res.status(500).json({ error: 'Error fetching Zoho data' });
  }
}

// Contacts module - Search
app.get('/zoho/Contacts/search', async (req, res) => {
  const criteria = req.query.criteria || '';
  const encodedCriteria = encodeURIComponent(criteria);
  const apiUrl = `https://www.zohoapis.com/crm/v2/Contacts/search?criteria=${encodedCriteria}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Update Contact by contactId
app.patch('/zoho/Contacts/by-id/:contactId', async (req, res) => {
  const contactId = req.params.contactId;
  const apiUrl = `https://www.zohoapis.com/crm/v2/Contacts/${contactId}`;
  const updateData = {
    data: [req.body] // Zoho expects data to be in an array format
  };
  await handleZohoApiRequest(apiUrl, res, 'PATCH', updateData);
});

// Update Contact by crmRecid (corrected)
app.patch('/zoho/Contacts/by-crmRecid/:crmRecid', async (req, res) => {
  const crmRecid = req.params.crmRecid;
  if (!crmRecid) {
    return res.status(400).json({ error: 'crmRecid is required' });
  }

  const apiUrl = `https://www.zohoapis.com/crm/v2/Contacts/${crmRecid}`;
  const updateData = {
    data: [req.body] // Zoho expects data to be in an array format
  };

  await handleZohoApiRequest(apiUrl, res, 'PATCH', updateData);
});

// Get Contact by crmRecid
app.get('/zoho/Contacts/by-crmRecid/:crmRecid', async (req, res) => {
  const crmRecid = req.params.crmRecid;
  if (!crmRecid) {
    return res.status(400).json({ error: 'crmRecid is required' });
  }

  const apiUrl = `https://www.zohoapis.com/crm/v2/Contacts/${crmRecid}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Member - Dashboard
app.get('/zoho/Member/:mid', async (req, res) => {
  const mid = req.params.mid;
  const apiUrl = `https://www.zohoapis.com/crm/v7/Member/${mid}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Subscriptions - Subscriptions
app.get('/zoho/Subscriptions/search', async (req, res) => {
  const criteria = req.query.criteria || '';
  const apiUrl = `https://www.zohoapis.com/crm/v7/Subscriptions/search?criteria=${criteria}`;
  await handleZohoApiRequest(apiUrl, res);
});

// Transactions - Transactions
app.get('/zoho/Transactions/search', async (req, res) => {
  const criteria = req.query.criteria || '';
  const apiUrl = `https://www.zohoapis.com/crm/v7/Transactions/search?criteria=${criteria}`;
  await handleZohoApiRequest(apiUrl, res);
});

// Accounts module
app.get('/zoho/Accounts/search', async (req, res) => {
  const criteria = req.query.criteria || '';
  const apiUrl = `https://www.zohoapis.com/crm/v2/Accounts/search?criteria=${criteria}`;
  await handleZohoApiRequest(apiUrl, res);
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
