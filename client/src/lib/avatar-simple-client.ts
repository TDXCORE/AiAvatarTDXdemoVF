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
  private token: string | null = null;
  private isHeyGenSession: boolean = false;
  private onStateChange?: (state: Partial<SimpleAvatarState>) => void;

  constructor(onStateChange?: (state: Partial<SimpleAvatarState>) => void) {
    this.onStateChange = onStateChange;
  }

  async initialize(): Promise<void> {
    try {
      this.onStateChange?.({ phase: 'initializing' });

      // 1. Create token for session hygiene
      const tokenResponse = await fetch('/api/avatar/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (tokenResponse.ok) {
        const tokenResult = await tokenResponse.json();
        this.token = tokenResult.token;
      }

      // 2. Create real HeyGen session (not fallback)
      const response = await fetch('/api/avatar/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          avatarId: 'Dexter_Doctor_Standing2_public',
          forceHeyGen: true // Force real HeyGen instead of fallback
        })
      });

      if (!response.ok) {
        throw new Error(`Session creation failed: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Session creation failed');
      }

      this.sessionId = result.data.sessionId;
      this.isHeyGenSession = !this.sessionId.startsWith('fallback_');

      console.log(`Avatar session created: ${this.sessionId} (HeyGen: ${this.isHeyGenSession})`);

      // Manejar tanto HeyGen como fallback sessions
      if (!this.isHeyGenSession) {
        console.log('Using fallback session - avatar will show static preview');
        this.onStateChange?.({
          phase: 'ready',
          sessionId: this.sessionId,
          previewUrl: result.data.previewUrl,
          isConnected: false // Fallback mode
        });
        return; // No intentar operaciones de streaming
      }

      this.onStateChange?.({
        phase: 'ready',
        sessionId: this.sessionId,
        previewUrl: result.data.previewUrl,
        isConnected: true // Activar preview inmediatamente
      });

      // HeyGen REPEAT sessions son ready inmediatamente, preview activado
      console.log('HeyGen session ready for REPEAT mode with preview active');

    } catch (error) {
      console.error('Session initialization failed:', error);
      this.onStateChange?.({ 
        phase: 'error', 
        error: error instanceof Error ? error.message : 'Failed to initialize session' 
      });
      throw error;
    }
  }

  private async startHeyGenSession(): Promise<void> {
    if (!this.sessionId || !this.isHeyGenSession) return;

    try {
      // Start the HeyGen streaming session
      const response = await fetch('/api/avatar/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId })
      });

      if (!response.ok) {
        console.warn('Failed to start HeyGen session, will use fallback display');
        return;
      }

      this.onStateChange?.({ phase: 'ready', isConnected: true });
      console.log('HeyGen streaming session started successfully');

    } catch (error) {
      console.warn('HeyGen session start failed:', error);
    }
  }

  async speak(text: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    try {
      this.onStateChange?.({ phase: 'speaking' });

      // Check if fallback session
      if (!this.isHeyGenSession) {
        console.log('Fallback session - simulating speech:', text);
        // Simulate speaking for fallback
        setTimeout(() => {
          this.onStateChange?.({ phase: 'ready' });
        }, 2000);
        return;
      }

      // Send text to HeyGen with REPEAT mode
      const response = await fetch('/api/avatar/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          text: text,
          taskType: 'REPEAT'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send text to avatar');
      }

      console.log('Avatar speaking with REPEAT mode (TTS + LipSync):', text);

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
    if (!this.sessionId && !this.token) {
      return;
    }

    try {
      // Close session with token if available
      if (this.token) {
        await fetch('/api/avatar/close-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: this.token })
        });
      }

      // Close regular session
      if (this.sessionId) {
        await fetch('/api/avatar/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: this.sessionId })
        });
      }

      console.log('Avatar session closed:', this.sessionId);
    } catch (error) {
      console.warn('Failed to close avatar session:', error);
    } finally {
      this.sessionId = null;
      this.token = null;
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  isActive(): boolean {
    return this.sessionId !== null;
  }
}