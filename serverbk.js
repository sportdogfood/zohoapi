const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors'); // Import the CORS package
const app = express();

let zohoAccessToken = '';
let zohoRefreshToken = process.env.ZOHO_REFRESH_TOKEN; // Stored in Heroku environment
let clientId = process.env.ZOHO_CLIENT_ID;
let clientSecret = process.env.ZOHO_CLIENT_SECRET;

// Middleware to enable CORS for all requests
app.use(cors()); // This will allow all origins by default

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
async function handleZohoApiRequest(apiUrl, res) {
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
      const errorResponse = await response.json();
      console.error(`Zoho API Error: ${response.statusText}`, errorResponse);
      throw new Error(`Zoho API Error: ${response.statusText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching Zoho data:", error);
    res.status(500).json({ error: 'Error fetching Zoho data' });
  }
}


// Zoho CRM API proxy routes for different modules

// Contacts module
app.get('/zoho/Contacts/search', async (req, res) => {
  const criteria = req.query.criteria || '';  // Fetch the criteria from query parameters
  const apiUrl = `https://www.zohoapis.com/crm/v2/Contacts/search?criteria=${criteria}`;
  await handleZohoApiRequest(apiUrl, res);
});

// Update Contact in Contacts module
app.patch('/zoho/Contacts/:contactId', async (req, res) => {
  const contactId = req.params.contactId; // Fetch the contact ID from the request parameters
  const apiUrl = `https://www.zohoapis.com/crm/v2/Contacts/${contactId}`;
  const updateData = req.body; // Fetch the update data from the request body

  // Pass updateData as the body of the PATCH request
  await handleZohoApiRequest(apiUrl, res, 'PATCH', updateData);
});

// Update Contact in Contacts module using crmRecid
app.patch('/zoho/Contacts/:crmRecid', async (req, res) => {
  const crmRecid = req.params.crmRecid; // Fetch the crmRecid from the request parameters
  const apiUrl = `https://www.zohoapis.com/crm/v2/Contacts/${crmRecid}`;
  const updateData = req.body; // Fetch the update data from the request body

  // Pass updateData as the body of the PATCH request
  await handleZohoApiRequest(apiUrl, res, 'PATCH', updateData);
});

// Get Contact in Contacts module using crmRecid
app.get('/zoho/Contacts/:crmRecid', async (req, res) => {
  const crmRecid = req.params.crmRecid; // Fetch the crmRecid from the request parameters
  const apiUrl = `https://www.zohoapis.com/crm/v2/Contacts/${crmRecid}`;

  // Make GET request to fetch contact data
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Member - Dashboard
app.get('/zoho/Member/:mid', async (req, res) => {
  const crmRecid = req.params.mid;
  const apiUrl = `https://www.zohoapis.com/crm/v7/Member/${mid}`;
  await handleZohoApiRequest(apiUrl, res);
});

// Member - Dashboard
app.get('/zoho/Member/search', async (req, res) => {
  const criteria = req.query.criteria || '';
  const apiUrl = `https://www.zohoapis.com/crm/v7/Member/search?criteria=${criteria}`;
  await handleZohoApiRequest(apiUrl, res);
});



// Dashboard - Dashboard
app.get('/zoho/Dashboard/search', async (req, res) => {
  const criteria = req.query.criteria || '';
  const apiUrl = `https://www.zohoapis.com/crm/v7/Dashboard/search?criteria=${criteria}`;
  await handleZohoApiRequest(apiUrl, res);
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

// Zoho Desk module
app.get('/zoho/Desk/search', async (req, res) => {
  const criteria = req.query.criteria || '';
  const apiUrl = `https://desk.zoho.com/api/v1/tickets/search?criteria=${criteria}`;
  await handleZohoApiRequest(apiUrl, res);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
