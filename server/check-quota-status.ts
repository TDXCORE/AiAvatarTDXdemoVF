import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

async function checkQuotaStatus() {
  const apiKey = process.env.HEYGEN_API_KEY;

  if (!apiKey) {
    console.error('❌ HEYGEN_API_KEY not found in environment');
    return;
  }

  console.log('🔍 Checking HeyGen account status...');
  console.log('📋 API Key length:', apiKey.length);
  console.log('📋 First 20 chars:', apiKey.substring(0, 20) + '...');

  try {
    // 1. Check if we can create a token (this validates our API key)
    console.log('\n🧪 Testing token creation...');
    const tokenResponse = await fetch('https://api.heygen.com/v1/streaming.create_token', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
    });

    const tokenData = await tokenResponse.json();

    if (tokenResponse.ok) {
      console.log('✅ Token creation SUCCESS');
      console.log('📄 Response:', JSON.stringify(tokenData, null, 2));
    } else {
      console.log('❌ Token creation FAILED');
      console.log('📄 Status:', tokenResponse.status);
      console.log('📄 Response:', JSON.stringify(tokenData, null, 2));

      if (tokenData.code === 'quota_not_enough') {
        console.log('\n💡 QUOTA ISSUE DETECTED:');
        console.log('- Your API key is valid but you have insufficient quota');
        console.log('- This could be a streaming-specific quota limit');
        console.log('- Check your HeyGen dashboard for quota details');
      }
      return;
    }

    // 2. Try to list available avatars (another quota check)
    console.log('\n🎭 Testing avatar list access...');
    const avatarResponse = await fetch('https://api.heygen.com/v1/avatar.list', {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
      },
    });

    const avatarData = await avatarResponse.json();

    if (avatarResponse.ok) {
      console.log('✅ Avatar list access SUCCESS');
      console.log('📄 Available avatars:', avatarData.data?.avatars?.length || 0);
    } else {
      console.log('❌ Avatar list access FAILED');
      console.log('📄 Status:', avatarResponse.status);
      console.log('📄 Response:', JSON.stringify(avatarData, null, 2));
    }

    // 3. Try creating a streaming session to test the exact error
    console.log('\n🎬 Testing streaming session creation...');
    const streamingResponse = await fetch('https://api.heygen.com/v1/streaming.new', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.data?.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quality: 'low',
        avatar_id: 'Graham_Chair_Sitting_public',
        voice: {
          voice_id: 'b7d50908a434433ba7ed7b75d2f5ab72'
        }
      }),
    });

    const streamingData = await streamingResponse.json();

    if (streamingResponse.ok) {
      console.log('✅ Streaming session creation SUCCESS');
      console.log('📄 Session ID:', streamingData.data?.session_id);

      // Close the session immediately
      if (streamingData.data?.session_id) {
        await fetch(`https://api.heygen.com/v1/streaming.stop`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.data?.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session_id: streamingData.data.session_id
          }),
        });
        console.log('🛑 Test session closed');
      }
    } else {
      console.log('❌ Streaming session creation FAILED');
      console.log('📄 Status:', streamingResponse.status);
      console.log('📄 Response:', JSON.stringify(streamingData, null, 2));

      if (streamingData.code === 'quota_not_enough') {
        console.log('\n🎯 ROOT CAUSE IDENTIFIED:');
        console.log('- Your account has reached the streaming quota limit');
        console.log('- This is specifically for streaming sessions, not general API calls');
        console.log('- You may need to upgrade your plan or wait for quota reset');
        console.log('- Contact HeyGen support if you believe this is an error');
      }
    }

  } catch (error) {
    console.error('❌ Error during quota check:', error);
  }
}

checkQuotaStatus();