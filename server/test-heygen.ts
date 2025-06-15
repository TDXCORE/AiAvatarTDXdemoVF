// Test script to verify HeyGen API and find valid voice IDs
import fetch from 'node-fetch';

const apiKey = process.env.HEYGEN_API_KEY;

async function testHeyGenAPI() {
  console.log('Testing HeyGen API...');
  
  try {
    // Test 1: Get available voices
    console.log('\n1. Testing available voices...');
    const voicesResponse = await fetch('https://api.heygen.com/v1/voice.list', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    if (voicesResponse.ok) {
      const voicesData = await voicesResponse.json();
      console.log('Available voices:', JSON.stringify(voicesData, null, 2));
    } else {
      console.log('Voices request failed:', voicesResponse.status, await voicesResponse.text());
    }

    // Test 2: Get available avatars
    console.log('\n2. Testing available avatars...');
    const avatarsResponse = await fetch('https://api.heygen.com/v1/avatar.list', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    if (avatarsResponse.ok) {
      const avatarsData = await avatarsResponse.json();
      console.log('Available avatars:', JSON.stringify(avatarsData, null, 2));
    } else {
      console.log('Avatars request failed:', avatarsResponse.status, await avatarsResponse.text());
    }

    // Test 3: Try creating a streaming session with basic settings
    console.log('\n3. Testing streaming session creation...');
    const sessionResponse = await fetch('https://api.heygen.com/v1/streaming.new', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quality: 'high',
        avatar_name: 'Dexter_Doctor_Standing2_public'
      }),
    });
    
    if (sessionResponse.ok) {
      const sessionData = await sessionResponse.json();
      console.log('Session created successfully:', JSON.stringify(sessionData, null, 2));
    } else {
      console.log('Session creation failed:', sessionResponse.status, await sessionResponse.text());
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testHeyGenAPI();