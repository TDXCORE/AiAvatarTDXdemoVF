// Simple test to verify HeyGen API connection
import fetch from 'node-fetch';

const apiKey = process.env.HEYGEN_API_KEY;

async function testConnection() {
  console.log('Testing HeyGen API connection...');
  
  try {
    const response = await fetch('https://api.heygen.com/v1/streaming.new', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quality: 'high',
        avatar_name: 'josh_lite3_20230714',
        voice: {
          voice_id: '08284d3fc63a424fbe80cc1864ed2540',
          rate: 1.0
        }
      }),
    });
    
    console.log('Response status:', response.status);
    const result = await response.text();
    console.log('Response:', result.substring(0, 500));
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testConnection();