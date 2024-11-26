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

// Member - Dashboard
app.get('/zoho/Member/:mid', async (req, res) => {
  const mid = req.params.mid;
  const apiUrl = `https://www.zohoapis.com/crm/v7/Member/${mid}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});


// New Routes for Fetching Modules by ID

// Accounts Module - Get by ID
app.get('/zoho/Accounts/by-id/:accountId', async (req, res) => {
  const accountId = req.params.accountId;
  if (!accountId) {
    return res.status(400).json({ error: 'accountId is required' });
  }

  const apiUrl = `https://www.zohoapis.com/crm/v2/Accounts/${accountId}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Products Module - Get by ID
app.get('/zoho/Products/by-id/:productId', async (req, res) => {
  const productId = req.params.productId;
  if (!productId) {
    return res.status(400).json({ error: 'productId is required' });
  }

  const apiUrl = `https://www.zohoapis.com/crm/v2/Products/${productId}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Leads Module - Get by ID
app.get('/zoho/Leads/by-id/:leadId', async (req, res) => {
  const leadId = req.params.leadId;
  if (!leadId) {
    return res.status(400).json({ error: 'leadId is required' });
  }

  const apiUrl = `https://www.zohoapis.com/crm/v2/Leads/${leadId}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Member Module - Get by ID
app.get('/zoho/Member/by-id/:memberId', async (req, res) => {
  const memberId = req.params.memberId;
  if (!memberId) {
    return res.status(400).json({ error: 'memberId is required' });
  }

  const apiUrl = `https://www.zohoapis.com/crm/v2/Member/${memberId}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Reviews Module - Get by ID
app.get('/zoho/Reviews/by-id/:reviewId', async (req, res) => {
  const reviewId = req.params.reviewId;
  if (!reviewId) {
    return res.status(400).json({ error: 'reviewId is required' });
  }

  const apiUrl = `https://www.zohoapis.com/crm/v2/Reviews/${reviewId}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Dog_Profiles Module - Get by ID
app.get('/zoho/Dog_Profiles/by-id/:dogProfileId', async (req, res) => {
  const dogProfileId = req.params.dogProfileId;
  if (!dogProfileId) {
    return res.status(400).json({ error: 'dogProfileId is required' });
  }

  const apiUrl = `https://www.zohoapis.com/crm/v2/Dog_Profiles/${dogProfileId}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Change_Log Module - Get by ID
app.get('/zoho/Change_Log/by-id/:changeLogId', async (req, res) => {
  const changeLogId = req.params.changeLogId;
  if (!changeLogId) {
    return res.status(400).json({ error: 'changeLogId is required' });
  }

  const apiUrl = `https://www.zohoapis.com/crm/v2/Change_Log/${changeLogId}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Master_Items Module - Get by ID
app.get('/zoho/Master_Items/by-id/:masterItemId', async (req, res) => {
  const masterItemId = req.params.masterItemId;
  if (!masterItemId) {
    return res.status(400).json({ error: 'masterItemId is required' });
  }

  const apiUrl = `https://www.zohoapis.com/crm/v2/Master_Items/${masterItemId}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Optionally, add the Generic Route here
/*
app.get('/zoho/:moduleName/by-id/:recordId', async (req, res) => {
  const { moduleName, recordId } = req.params;

  if (!moduleName || !recordId) {
    return res.status(400).json({ error: 'moduleName and recordId are required' });
  }

  // Validate moduleName against a list of allowed modules to prevent misuse
  const allowedModules = ['Accounts', 'Products', 'Leads', 'Member', 'Reviews', 'Dog_Profiles', 'Change_Log', 'Master_Items'];
  if (!allowedModules.includes(moduleName)) {
    return res.status(400).json({ error: `Invalid module name. Allowed modules are: ${allowedModules.join(', ')}` });
  }

  const apiUrl = `https://www.zohoapis.com/crm/v2/${moduleName}/${recordId}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});
*/


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
