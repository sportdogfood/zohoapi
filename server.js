const express = require('express');
const fetch = require('node-fetch');
const app = express();




// Store Zoho tokens in memory (or move to a secure storage)
let zohoAccessToken = '1000.53adb3a59dcb658e516d081475fadca6.57cd2d35ebea92ca00820085c8acb24d';
let zohoRefreshToken = '1000.7ac9080bdb21fedbf36fea05fbec209d.e92430a6a66580fdea97f0747da50d1d';

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware to add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// ------------------------------------------------------
//  Zoho CRM API Section
// ------------------------------------------------------

// Function to refresh the Zoho CRM access token
async function refreshZohoToken() {
  try {
    const refreshResponse = await fetch('https://accounts.zoho.com/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: zohoRefreshToken,  // Using stored refresh token
        client_id: '1000.3VZRY3CC9QGZBXA8IZZ6TWZTZV1H6H',  // Your Zoho client ID
        client_secret: '48dcd0b587246976e9dfcfcc54b10bfb211686cbe4',  // Your Zoho client secret
      }),
    });

    const tokenData = await refreshResponse.json();
    
    // Check if the access token was successfully received
    if (tokenData.access_token) {
      console.log('Zoho access token refreshed:', tokenData.access_token);
      zohoAccessToken = tokenData.access_token;  // Update the access token in memory
      return zohoAccessToken;
    } else {
      console.error('Error refreshing Zoho token:', tokenData);
      throw new Error('Failed to refresh Zoho access token');
    }
  } catch (error) {
    console.error('Error refreshing Zoho access token:', error);
    throw error;
  }
}

// Zoho CRM API route that uses the token
app.all('/zoho/:endpoint*', async (req, res) => {
  try {
    // Check if access token is available, otherwise refresh it
    const accessToken = zohoAccessToken || await refreshZohoToken(); 
    const endpoint = req.params.endpoint + (req.params[0] || '');  // Support dynamic subpaths
    const apiUrl = `https://www.zohoapis.com/crm/v2/${endpoint}`;  // Zoho CRM API base URL

    console.log(`Forwarding request to: ${apiUrl}`);  // Log the full API URL

    // Send request to Zoho CRM API
    const apiResponse = await fetch(apiUrl, {
      method: req.method,
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': req.get('Content-Type') || 'application/json',
      },
      body: ['POST', 'PUT'].includes(req.method) ? JSON.stringify(req.body) : undefined,
    });

    // If the API response indicates an expired token, refresh the token
    if (apiResponse.status === 401) {
      console.log('Access token expired. Refreshing token...');
      await refreshZohoToken();  // Refresh the token
      return res.redirect(req.originalUrl);  // Retry the request after refreshing
    }

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.log(`Zoho API response status: ${apiResponse.status}, body: ${errorText}`);
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    // Return Zoho CRM API response to the client
    console.log("Zoho CRM API response data:", data);
    res.json(data); 
  } catch (error) {
    console.error("Error in Zoho CRM API proxy route:", error);
    res.status(500).json({ error: 'Error fetching data from Zoho CRM API' });
  }
});

// ------------------------------------------------------
//  Server Initialization
// ------------------------------------------------------

// Start the server on the port specified by Heroku or on 3000 locally
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
