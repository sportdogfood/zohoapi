// server.js
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const axios = require('axios'); // Ensure axios is imported
const NodeCache = require('node-cache'); // Import Node-Cache
const app = express();

// Initialize cache with default TTL (1 hour) and check period (2 minutes)
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

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

// Helper function to handle Zoho API requests and token refresh with caching
async function handleZohoApiRequest(apiUrl, res, method = 'GET', body = null) {
  try {
    // Generate a unique cache key based on method and URL
    const cacheKey = `${method}:${apiUrl}:${body ? JSON.stringify(body) : ''}`;

    // Check if response exists in cache (only for GET requests)
    if (method === 'GET') {
      const cachedData = cache.get(cacheKey);
      if (cachedData) {
        console.log(`Cache hit for key: ${cacheKey}`);
        return res.json(cachedData);
      }
      console.log(`Cache miss for key: ${cacheKey}`);
    }

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

    // Store the response in cache if it's a GET request
    if (method === 'GET') {
      cache.set(cacheKey, data);
      console.log(`Data cached for key: ${cacheKey}`);
    }

    return res.json(data);
  } catch (error) {
    console.error("Error fetching Zoho data:", error);
    return res.status(500).json({ error: 'Error fetching Zoho data' });
  }
}

// Route to test the refresh token functionality
app.get('/test/auth', async (req, res) => {
  try {
    // Call the refresh function
    await refreshZohoToken();

    // Send back the updated tokens
    res.json({
      message: 'Zoho Access Token refreshed successfully',
      access_token: zohoAccessToken,
      refresh_token: zohoRefreshToken
    });
  } catch (error) {
    res.status(500).json({ error: 'Error refreshing Zoho access token', details: error.message });
  }
});

// Contacts module - Search
app.get('/zoho/Contacts/search', async (req, res) => {
  const criteria = req.query.criteria || '';
  const encodedCriteria = encodeURIComponent(criteria);
  const apiUrl = `https://www.zohoapis.com/crm/v2/Contacts/search?criteria=${encodedCriteria}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Update Contact by crmRecid
app.patch('/zoho/Contacts/by-crmRecid/:crmRecid', async (req, res) => {
  const crmRecid = req.params.crmRecid;

  if (!crmRecid) {
    console.error('CRM Record ID (crmRecid) is required');
    return res.status(400).json({ error: 'crmRecid is required' });
  }

  // Logging for troubleshooting
  console.log('Patch request to update crmRecid:', crmRecid);
  console.log('Request body received:', req.body);

  // Ensure that request body is in the correct format
  if (!req.body || typeof req.body !== 'object') {
    console.error('Invalid request body. Must be a JSON object.');
    return res.status(400).json({ error: 'Invalid request body. Must be a JSON object.' });
  }

  const apiUrl = `https://www.zohoapis.com/crm/v2/Contacts/${crmRecid}`;
  const updateData = {
    data: [req.body] // Zoho expects 'data' to be an array containing objects representing the fields to update
  };

  // Adding a clear log for the final update data
  console.log('Update data being sent to Zoho CRM:', JSON.stringify(updateData, null, 2));

  try {
    const response = await axios.patch(apiUrl, updateData, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${zohoAccessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200 && response.data.data) {
      console.log('Zoho CRM Update Response:', JSON.stringify(response.data, null, 2));
      res.status(200).json({ success: true, message: 'Record updated successfully', data: response.data.data });
    } else {
      console.error('Unexpected response from Zoho CRM:', response.status, response.data);
      res.status(response.status).json({ error: 'Failed to update the record', details: response.data });
    }
  } catch (error) {
    console.error('Error during CRM PATCH request:', error.message || error);
    res.status(500).json({ error: 'Error updating Zoho CRM data', details: error.response ? error.response.data : error.message });
  }
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

// Get Contact by crmRecid
app.get('/zoho/Contacts/by-crmRecid/:crmRecid', async (req, res) => {
  const crmRecid = req.params.crmRecid;
  if (!crmRecid) {
    return res.status(400).json({ error: 'crmRecid is required' });
  }

  const apiUrl = `https://www.zohoapis.com/crm/v2/Contacts/${crmRecid}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Get Account by acctRecid
app.get('/zoho/Accounts/by-acctId/:acctId', async (req, res) => {
  const acctId = req.params.acctId;
  if (!acctId) {
    return res.status(400).json({ error: 'acctId is required' });
  }

   const apiUrl = `https://www.zohoapis.com/crm/v2/Accounts/${acctId}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Get Customers by crmRecid
app.get('/zoho/Customers/by-crmId/:crmId', async (req, res) => {
  const crmId = req.params.crmId;
  if (!crmId) {
    return res.status(400).json({ error: 'crmId is required' });
  }

   const apiUrl = `https://www.zohoapis.com/crm/v2/Contacts/${crmId}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Get Contacts by crmRecid
app.get('/zoho/Contacts/by-crmId/:crmId', async (req, res) => {
  const crmId = req.params.crmId;
  if (!crmId) {
    return res.status(400).json({ error: 'crmId is required' });
  }

   const apiUrl = `https://www.zohoapis.com/crm/v2/Contacts/${crmId}`;
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
  const apiUrl = `https://www.zohoapis.com/crm/v7/Subscriptions/search?criteria=${encodeURIComponent(criteria)}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Transactions - Transactions
app.get('/zoho/Transactions/search', async (req, res) => {
  const criteria = req.query.criteria || '';
  const apiUrl = `https://www.zohoapis.com/crm/v7/Transactions/search?criteria=${encodeURIComponent(criteria)}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Accounts module
app.get('/zoho/Accounts/search', async (req, res) => {
  const criteria = req.query.criteria || '';
  const encodedCriteria = encodeURIComponent(criteria);
  const apiUrl = `https://www.zohoapis.com/crm/v2/Accounts/search?criteria=${encodedCriteria}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Route handler for '/zoho/coql/query'
app.post('/zoho/coql/query', async (req, res) => {
  const lastName = req.body.lastName;

  if (!lastName) {
    console.error('Last name is required for COQL query');
    return res.status(400).json({ error: 'Last name is required' });
  }

  // Constructing the COQL query with the provided last name
  const coqlQuery = {
    select_query: `select Last_Name, First_Name, Foxy_Id from Contacts where (((Last_Name = '${lastName}'))) limit 1`
  };

  const apiUrl = 'https://www.zohoapis.com/crm/v2/coql';

  try {
    console.log('Sending COQL request to Zoho CRM with query:', JSON.stringify(coqlQuery, null, 2));
    console.log('API URL:', apiUrl);

    // Making COQL API request to Zoho
    const response = await axios.post(apiUrl, coqlQuery, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${zohoAccessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('COQL API call completed successfully:', response.data);

    if (response.data && response.data.data) {
      res.status(200).json({ success: true, data: response.data.data });
    } else {
      console.error('Unexpected response from Zoho CRM COQL:', response.status, response.data);
      res.status(response.status).json({ error: 'No matching records found', details: response.data });
    }
  } catch (error) {
    console.error('Error during COQL request:', error.message || error);
    res.status(500).json({ error: 'Error executing COQL request', details: error.response ? error.response.data : error.message });
  }
});

app.post('/zoho/:module', async (req, res) => {
  const moduleName = req.params.module;              // e.g. "Contacts", "Deals", "Leads", etc.
  const apiUrl     = `https://www.zohoapis.com/crm/v2/${moduleName}`;
  const payload    = { data: [ req.body ] };         // Zoho expects an array under `data`

  // optional: validate moduleName against whitelist
  const allowed = ['Contacts','Leads','Deals','Accounts','Products'];
  if (!allowed.includes(moduleName)) {
    return res.status(400).json({ error: `Invalid module: ${moduleName}` });
  }

  // Use your helper to handle token refresh / caching / error‐formatting
  await handleZohoApiRequest(apiUrl, res, 'POST', payload);
});
// New Routes for Fetching Modules by ID

// Generic Module Get by ID Route
app.get('/zoho/:moduleName/by-id/:recordId', async (req, res) => {
  const { moduleName, recordId } = req.params;

  if (!moduleName || !recordId) {
    return res.status(400).json({ error: 'moduleName and recordId are required' });
  }

  // Only allow known modules
  const allowedModules = [
    'Accounts', 'Addresses', 'CustomModule48', 'Attributes', 'Brands', 'Breeds', 'Cards', 'Cart-Items', 'Carts',
    'Cases', 'Compares', 'Coupons', 'Customers', 'Dashboards', 'Discounts', 'Dogs', 'Galleries',
    'Invoice-Activity', 'Invoices', 'Item-Activity', 'Landings', 'Ledgers', 'Levels', 'Package-Activity',
    'Packages', 'Packs', 'Payments', 'Personas', 'PersonaStates', 'Points', 'Polls', 'Posts', 'Potentials',
    'Products', 'Redemptions', 'Reviews', 'Rewards', 'Shipment-Activity', 'Shipment-Items', 'Shipments',
    'States', 'StatesZip3', 'Subscription-Activity', 'Subscriptions', 'Tasks', 'Threads', 'Thrive', 'Tlds',
    'Transaction-Activity', 'Transaction-Items', 'Transactions', 'Trigger-Activity', 'Warehouses', 'Zips',
    'Zoom', 'Zoom-Activity'
  ];

  if (!allowedModules.includes(moduleName)) {
    return res.status(400).json({
      error: `Invalid module name. Allowed modules: ${allowedModules.join(', ')}`
    });
  }

  const apiUrl = `https://www.zohoapis.com/crm/v2/${moduleName}/${recordId}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
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
