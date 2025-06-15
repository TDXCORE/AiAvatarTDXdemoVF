// Simplified HeyGen client that just manages session state
export interface SimpleHeyGenState {
  phase: 'initializing' | 'preview' | 'connecting' | 'ready' | 'listening' | 'speaking' | 'error';
  sessionId: string | null;
  previewUrl: string | null;
  error: string | null;
  isConnected: boolean;
}

export class SimpleHeyGenClient {
  private sessionId: string | null = null;
  private onStateChange?: (state: Partial<SimpleHeyGenState>) => void;

  constructor(onStateChange?: (state: Partial<SimpleHeyGenState>) => void) {
    this.onStateChange = onStateChange;
  }

  async createSession(): Promise<void> {
    try {
      this.onStateChange?.({ phase: 'initializing' });

      const response = await fetch('/api/avatar/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarId: 'josh_lite3_20230714' })
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Session creation failed');
      }

      this.sessionId = result.data.sessionId;
      
      this.onStateChange?.({
        phase: 'preview',
        sessionId: this.sessionId,
        previewUrl: result.data.previewUrl,
        isConnected: false
      });

      console.log('Session created:', this.sessionId);
    } catch (error) {
      console.error('Session creation failed:', error);
      this.onStateChange?.({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Session creation failed'
      });
      throw error;
    }
  }

  async startStreaming(): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No session available');
    }

    try {
      this.onStateChange?.({ phase: 'connecting' });

      // Start the HeyGen session
      const startResponse = await fetch('/api/avatar/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId })
      });

      if (!startResponse.ok) {
        throw new Error('Failed to start streaming');
      }

      this.onStateChange?.({
        phase: 'ready',
        isConnected: true
      });

      // Send initial greeting
      setTimeout(() => {
        this.sendGreeting();
      }, 2000);

      console.log('Streaming started for session:', this.sessionId);
    } catch (error) {
      console.error('Failed to start streaming:', error);
      this.onStateChange?.({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Streaming failed'
      });
      throw error;
    }
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    try {
      this.onStateChange?.({ phase: 'speaking' });

      const response = await fetch('/api/avatar/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          text: text
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      console.log('Message sent to avatar:', text);
      
      // Return to ready state after estimated speech time
      const estimatedSpeechTime = text.length * 50;
      setTimeout(() => {
        this.onStateChange?.({ phase: 'ready' });
      }, Math.max(estimatedSpeechTime, 2000));

    } catch (error) {
      console.error('Failed to send message:', error);
      this.onStateChange?.({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Message send failed'
      });
      throw error;
    }
  }

  async sendGreeting(): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    try {
      const response = await fetch('/api/avatar/greet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId })
      });

      if (response.ok) {
        console.log('Greeting sent successfully');
      }
    } catch (error) {
      console.warn('Failed to send greeting:', error);
    }
  }

  async closeSession(): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    try {
      await fetch('/api/avatar/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId })
      });

      console.log('Session closed:', this.sessionId);
    } catch (error) {
      console.warn('Failed to close session:', error);
    } finally {
      this.sessionId = null;
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  isConnected(): boolean {
    return this.sessionId !== null;
  }
}