// Simple avatar client that uses preview image + TTS without streaming
export interface SimpleAvatarState {
  phase: 'initializing' | 'ready' | 'speaking' | 'listening' | 'error';
  sessionId: string | null;
  previewUrl: string | null;
  error: string | null;
  isConnected: boolean;
}

export class SimpleAvatarClient {
  private sessionId: string | null = null;
  private onStateChange?: (state: Partial<SimpleAvatarState>) => void;

  constructor(onStateChange?: (state: Partial<SimpleAvatarState>) => void) {
    this.onStateChange = onStateChange;
  }

  async initialize(): Promise<void> {
    try {
      this.onStateChange?.({ phase: 'initializing' });

      // Create a simple session for TTS
      const response = await fetch('/api/avatar/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarId: 'josh_lite3_20230714' })
      });

      if (!response.ok) {
        throw new Error('Failed to create avatar session');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Session creation failed');
      }

      this.sessionId = result.data.sessionId;
      
      this.onStateChange?.({
        phase: 'ready',
        sessionId: this.sessionId,
        previewUrl: result.data.previewUrl,
        isConnected: true
      });

      console.log('Avatar session ready:', this.sessionId);
    } catch (error) {
      console.error('Avatar initialization failed:', error);
      this.onStateChange?.({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Initialization failed'
      });
      throw error;
    }
  }

  async speak(text: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    try {
      this.onStateChange?.({ phase: 'speaking' });

      // Send text to HeyGen for speech synthesis
      const response = await fetch('/api/avatar/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          text: text
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send text to avatar');
      }

      console.log('Avatar speaking:', text);
      
      // Return to ready state after estimated speech time
      const estimatedSpeechTime = text.length * 50; // 50ms per character
      setTimeout(() => {
        this.onStateChange?.({ phase: 'ready' });
      }, Math.max(estimatedSpeechTime, 2000));

    } catch (error) {
      console.error('Avatar speech failed:', error);
      this.onStateChange?.({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Speech failed'
      });
      throw error;
    }
  }

  async setListening(): Promise<void> {
    this.onStateChange?.({ phase: 'listening' });
  }

  async setReady(): Promise<void> {
    this.onStateChange?.({ phase: 'ready' });
  }

  async close(): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    try {
      await fetch('/api/avatar/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId })
      });

      console.log('Avatar session closed:', this.sessionId);
    } catch (error) {
      console.warn('Failed to close avatar session:', error);
    } finally {
      this.sessionId = null;
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  isActive(): boolean {
    return this.sessionId !== null;
  }
}