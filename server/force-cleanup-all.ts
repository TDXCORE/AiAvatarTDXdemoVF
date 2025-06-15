// Force cleanup all HeyGen sessions to ensure fresh start
import { HeyGenService } from './heygen-service.js';

async function forceCleanupAll() {
  console.log('Force cleaning up ALL HeyGen sessions...');
  
  const heygenService = new HeyGenService();
  
  // Try to close multiple potential session IDs
  const potentialSessionIds = [
    'fe0fc279-4a36-11f0-ba0d-5e3b6a3b504d',
    'session_1',
    'session_2', 
    'session_3'
  ];
  
  for (const sessionId of potentialSessionIds) {
    try {
      await heygenService.closeSession(sessionId);
      console.log(`Cleaned session: ${sessionId}`);
    } catch (error) {
      // Ignore errors for non-existent sessions
    }
  }
  
  console.log('Force cleanup completed');
}

forceCleanupAll().catch(console.error);