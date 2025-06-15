// Complete pipeline test: Voice transcription -> LLM -> Avatar TTS
import { HeyGenService } from './heygen-service.js';
import { PsychologicalAgent } from './psychological-agent.js';
import { storage } from './storage.js';

async function testFullPipeline() {
  console.log('Testing complete voice-to-avatar pipeline...\n');
  
  try {
    // Initialize services
    const heygenService = new HeyGenService();
    const psychAgent = new PsychologicalAgent(storage);
    
    // Test 1: Create avatar session
    console.log('1. Creating HeyGen streaming session...');
    const sessionData = await heygenService.createStreamingSession();
    console.log(`Session created: ${sessionData.sessionId}`);
    console.log(`Stream URL: ${sessionData.streamUrl}`);
    
    // Test 2: Start the session
    console.log('\n2. Starting avatar session...');
    await heygenService.startSession(sessionData.sessionId);
    console.log('Session started successfully');
    
    // Test 3: Test psychological agent response
    console.log('\n3. Testing psychological agent...');
    const testMessage = "Hola doctor, me siento muy ansioso últimamente";
    const agentResponse = await psychAgent.processMessage('test-session', testMessage);
    console.log(`Agent response: ${agentResponse}`);
    
    // Test 4: Send response to avatar for TTS
    console.log('\n4. Sending text to avatar...');
    await heygenService.sendTextToSpeech(agentResponse, sessionData.sessionId);
    console.log('Text sent to avatar successfully');
    
    // Test 5: Send greeting
    console.log('\n5. Testing avatar greeting...');
    await heygenService.sendGreeting(sessionData.sessionId);
    console.log('Greeting sent successfully');
    
    // Clean up
    console.log('\n6. Closing session...');
    await heygenService.closeSession(sessionData.sessionId);
    console.log('Session closed successfully');
    
    console.log('\n✅ Full pipeline test completed successfully!');
    
  } catch (error) {
    console.error('❌ Pipeline test failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
  }
}

testFullPipeline();