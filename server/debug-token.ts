
import fetch from 'node-fetch';

async function debugToken() {
  console.log('🔍 Debugging token usage...');
  
  // Check what's in the environment
  const envToken = process.env.HEYGEN_API_KEY;
  console.log('📋 Token from .env file:');
  console.log(`  - Length: ${envToken?.length || 0} characters`);
  console.log(`  - First 20 chars: ${envToken?.substring(0, 20) || 'undefined'}...`);
  console.log(`  - Last 10 chars: ...${envToken?.substring(envToken.length - 10) || 'undefined'}`);
  
  // Test the token directly with Postman-like request
  console.log('\n🧪 Testing token with direct API call...');
  
  try {
    const response = await fetch('https://api.heygen.com/v1/streaming.create_token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${envToken}`,
        'Content-Type': 'application/json',
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Token creation SUCCESS with direct call');
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      const errorText = await response.text();
      console.log('❌ Token creation FAILED with direct call');
      console.log('Error:', errorText);
    }
    
  } catch (error) {
    console.error('❌ Request failed:', error);
  }
  
  // Test streaming session creation
  console.log('\n🎬 Testing streaming session creation...');
  
  try {
    const response = await fetch('https://api.heygen.com/v1/streaming.new', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${envToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quality: 'low',
        avatar_name: 'josh_lite3_20230714'
      })
    });
    
    console.log(`Streaming session status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Streaming session SUCCESS');
      console.log('Session data:', JSON.stringify(data, null, 2));
      
      // Close the session immediately
      if (data.data?.session_id) {
        await fetch('https://api.heygen.com/v1/streaming.stop', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${envToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session_id: data.data.session_id
          })
        });
        console.log('🔄 Test session closed');
      }
    } else {
      const errorText = await response.text();
      console.log('❌ Streaming session FAILED');
      console.log('Error:', errorText);
    }
    
  } catch (error) {
    console.error('❌ Streaming request failed:', error);
  }
}

debugToken();
