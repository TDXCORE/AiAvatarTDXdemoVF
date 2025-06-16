
import { HeyGenService } from './heygen-service.js';

async function cleanupSessions() {
  console.log('🧹 Manual HeyGen session cleanup starting...');
  
  try {
    const heygenService = new HeyGenService();
    await heygenService.forceCleanupAllSessions();
    
    // Wait a bit for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('✅ Manual cleanup completed successfully');
    console.log('You can now try initializing the avatar again');
    
  } catch (error) {
    console.error('❌ Manual cleanup failed:', error);
    console.log('You may need to wait a few minutes for sessions to expire naturally');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupSessions().then(() => process.exit(0));
}

export { cleanupSessions };
