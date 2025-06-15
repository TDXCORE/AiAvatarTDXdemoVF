// Force close the specific problematic session
import { HeyGenService } from './heygen-service.js';

async function forceCloseSpecificSession() {
  console.log('Force closing specific problematic session...');
  
  const heygenService = new HeyGenService();
  const problematicSessionId = 'fe0fc279-4a36-11f0-ba0d-5e3b6a3b504d';
  
  try {
    await heygenService.closeSession(problematicSessionId);
    console.log(`Successfully closed problematic session: ${problematicSessionId}`);
  } catch (error) {
    console.log(`Session ${problematicSessionId} closure result:`, error.message);
  }
  
  // Also try some variations and recent session IDs from logs
  const recentSessionIds = [
    '91aca4d4-4a3a-11f0-b3da-5e0a6fe58bfa',
    '108e6f3a-4a3a-11f0-b3da-5e0a6fe58bfa'
  ];
  
  for (const sessionId of recentSessionIds) {
    try {
      await heygenService.closeSession(sessionId);
      console.log(`Successfully closed recent session: ${sessionId}`);
    } catch (error) {
      console.log(`Recent session ${sessionId} closure result:`, error.message);
    }
  }
  
  console.log('Specific session cleanup completed');
}

forceCloseSpecificSession().catch(console.error);