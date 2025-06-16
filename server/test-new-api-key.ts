
import fetch from 'node-fetch';

async function testNewApiKey() {
  console.log('🔍 Testing new HeyGen API key...');
  
  const apiKey = process.env.HEYGEN_API_KEY;
  console.log(`Using API key: ${apiKey?.substring(0, 20)}...`);
  
  try {
    // Test 1: Check account info/quota
    console.log('\n1. Checking account information...');
    const accountResponse = await fetch('https://api.heygen.com/v1/user.info', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    if (accountResponse.ok) {
      const accountData = await accountResponse.json();
      console.log('✅ Account info:', JSON.stringify(accountData, null, 2));
    } else {
      console.log('❌ Account check failed:', accountResponse.status, await accountResponse.text());
    }

    // Test 2: Try to create a token
    console.log('\n2. Testing token creation...');
    const tokenResponse = await fetch('https://api.heygen.com/v1/streaming.create_token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      }
    });
    
    if (tokenResponse.ok) {
      const tokenData = await tokenResponse.json();
      console.log('✅ Token created successfully');
      console.log('Token data:', JSON.stringify(tokenData, null, 2));
    } else {
      const errorText = await tokenResponse.text();
      console.log('❌ Token creation failed:', tokenResponse.status, errorText);
      
      // Parse error for quota info
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.code === 'quota_not_enough') {
          console.log('💰 ISSUE: Your API key has insufficient credits/quota');
          console.log('💡 Please check your HeyGen dashboard for credit balance');
        }
      } catch (e) {
        // Error text is not JSON
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testNewApiKey();
