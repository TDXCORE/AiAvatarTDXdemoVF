// Clean up any active HeyGen sessions
import fetch from 'node-fetch';

const apiKey = process.env.HEYGEN_API_KEY;

async function cleanupSessions() {
  console.log('Cleaning up active HeyGen sessions...');
  
  try {
    // Try to stop any active sessions with common session IDs
    const testSessionIds = [
      'fe0fc279-4a36-11f0-ba0d-5e3b6a3b504d', // From previous test
    ];
    
    for (const sessionId of testSessionIds) {
      try {
        const response = await fetch('https://api.heygen.com/v1/streaming.stop', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session_id: sessionId
          }),
        });
        
        console.log(`Cleanup session ${sessionId}: ${response.status}`);
      } catch (error) {
        console.log(`Session ${sessionId} was already closed or doesn't exist`);
      }
    }
    
    console.log('Cleanup completed');
    
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
}

cleanupSessions();