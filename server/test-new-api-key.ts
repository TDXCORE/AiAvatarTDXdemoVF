
import fetch from 'node-fetch';

async function testNewApiKey() {
  console.log('🔍 Comprehensive HeyGen API key diagnostics...');
  
  const apiKey = process.env.HEYGEN_API_KEY;
  console.log(`Using API key: ${apiKey?.substring(0, 20)}...`);
  
  try {
    // Test 1: Check quota/billing endpoints
    console.log('\n1. Checking quota and billing...');
    const quotaEndpoints = [
      'https://api.heygen.com/v1/user.quota',
      'https://api.heygen.com/v1/user.billing',
      'https://api.heygen.com/v1/user.info',
      'https://api.heygen.com/v1/account/quota',
      'https://api.heygen.com/v1/account/info'
    ];
    
    for (const endpoint of quotaEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ ${endpoint}:`, JSON.stringify(data, null, 2));
        } else {
          console.log(`❌ ${endpoint}: ${response.status} - ${await response.text()}`);
        }
      } catch (e) {
        console.log(`⚠️ ${endpoint}: Request failed`);
      }
    }

    // Test 2: Check streaming session limits
    console.log('\n2. Testing streaming session creation with minimal config...');
    const minimalResponse = await fetch('https://api.heygen.com/v1/streaming.new', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quality: 'low',  // Use lowest quality to minimize quota usage
        avatar_name: 'josh_lite3_20230714'  // Basic avatar
      })
    });
    
    if (minimalResponse.ok) {
      const sessionData = await minimalResponse.json();
      console.log('✅ Minimal session created:', JSON.stringify(sessionData, null, 2));
      
      // Immediately close the session
      if (sessionData.data?.session_id) {
        await fetch('https://api.heygen.com/v1/streaming.stop', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session_id: sessionData.data.session_id
          })
        });
        console.log('✅ Test session closed');
      }
    } else {
      const errorText = await minimalResponse.text();
      console.log('❌ Minimal session failed:', minimalResponse.status, errorText);
      
      try {
        const errorJson = JSON.parse(errorText);
        console.log('🔍 Error analysis:');
        console.log('  - Code:', errorJson.code);
        console.log('  - Message:', errorJson.message);
        
        if (errorJson.code === 'quota_not_enough') {
          console.log('\n💡 SOLUTIONS TO TRY:');
          console.log('1. Wait a few minutes for quota to refresh');
          console.log('2. Check if this is a streaming-specific quota vs general API quota');
          console.log('3. Verify account type supports streaming features');
          console.log('4. Contact HeyGen support if you have credits but still see this error');
        }
      } catch (e) {
        console.log('Could not parse error as JSON');
      }
    }

    // Test 3: Try token creation again
    console.log('\n3. Testing token creation...');
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
    }

    // Test 4: Check available avatars and voices
    console.log('\n4. Testing avatar and voice access...');
    const avatarResponse = await fetch('https://api.heygen.com/v1/avatar.list', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    if (avatarResponse.ok) {
      const avatarData = await avatarResponse.json();
      console.log('✅ Available avatars:', avatarData.data?.avatars?.length || 0);
    } else {
      console.log('❌ Avatar list failed:', avatarResponse.status);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testNewApiKey();
