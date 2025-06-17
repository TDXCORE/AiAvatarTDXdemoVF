import StreamingAvatar, { 
  AvatarQuality, 
  StreamingEvents, 
  TaskType, 
  TaskMode 
} from '@heygen/streaming-avatar';

export interface StreamingAvatarState {
  phase: 'initializing' | 'connecting' | 'ready' | 'speaking' | 'listening' | 'error';
  isConnected: boolean;
  error: string | null;
  sessionToken: string | null;
}

export class StreamingAvatarClient {
  private streamingAvatar: StreamingAvatar | null = null;
  private sessionToken: string | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private onStateChange?: (state: Partial<StreamingAvatarState>) => void;

  constructor(onStateChange?: (state: Partial<StreamingAvatarState>) => void) {
    this.onStateChange = onStateChange;
  }

  async initialize(videoElement: HTMLVideoElement): Promise<void> {
    try {
      console.log('🚀 Inicializando StreamingAvatar...');
      this.videoElement = videoElement;
      this.onStateChange?.({ phase: 'initializing' });

      // 1. Get token from backend
      console.log('🔑 Obteniendo token...');
      const token = await this.getToken();
      this.sessionToken = token;
      console.log('✅ Token obtenido exitosamente');

      this.onStateChange?.({ sessionToken: token });

      // 2. Create StreamingAvatar instance
      console.log('🎭 Creando instancia de StreamingAvatar...');
      this.streamingAvatar = new StreamingAvatar({ 
        token: token
      });

      // 3. Setup event listeners
      this.setupEvents();

      this.onStateChange?.({ phase: 'connecting' });

      // 4. Create and start avatar
      console.log('🎬 Iniciando avatar...');
      await this.streamingAvatar.createStartAvatar({
        quality: AvatarQuality.Low,
        avatarName: 'Dexter_Doctor_Standing2_public',
        voice: {
          voiceId: '08284d3fc63a424fbe80cc1864ed2540', // Spanish male voice
          rate: 1.0
        },
        language: 'es'
      });

      console.log('🎉 StreamingAvatar initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize StreamingAvatar:', error);

      // Enhanced error logging
      if (error && typeof error === 'object') {
        console.error('Error details:', {
          name: (error as any).name,
          message: (error as any).message,
          status: (error as any).status,
          responseText: (error as any).responseText
        });
      }

      // Check for concurrent limit error
      let errorMessage = error instanceof Error ? error.message : 'Initialization failed';
      if (error && typeof error === 'object' && (error as any).responseText) {
        const responseText = (error as any).responseText;
        if (responseText.includes('10007') || responseText.includes('Concurrent limit reached')) {
          errorMessage = 'Concurrent session limit reached. Please wait a moment and try again.';
        }
      }

      this.onStateChange?.({ 
        phase: 'error', 
        error: errorMessage,
        isConnected: false
      });
      throw error;
    }
  }

  private async getToken(): Promise<string> {
    const response = await fetch('/api/avatar/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Failed to get avatar token');
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Token creation failed');
    }

    return result.token;
  }

  private setupEvents(): void {
    if (!this.streamingAvatar) return;

    this.streamingAvatar.on(StreamingEvents.STREAM_READY, (event) => {
      console.log('🎥 Stream ready:', event);

      // Set video source
      if (this.videoElement && event.detail) {
        this.videoElement.srcObject = event.detail;
        this.videoElement.play().catch(console.error);
      }

      this.onStateChange?.({ 
        phase: 'ready', 
        isConnected: true 
      });
    });

    this.streamingAvatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      console.log('🔌 Stream disconnected');
      this.onStateChange?.({ 
        phase: 'error', 
        error: 'Stream disconnected',
        isConnected: false 
      });
    });

    this.streamingAvatar.on(StreamingEvents.AVATAR_START_TALKING, (event) => {
      console.log('🎤 Avatar started talking:', event);
      this.onStateChange?.({ phase: 'speaking' });

      // Emit custom event for VAD control
      if (this.videoElement) {
        this.videoElement.dispatchEvent(new CustomEvent('avatar_start_talking', { detail: event }));
      }
    });

    this.streamingAvatar.on(StreamingEvents.AVATAR_STOP_TALKING, (event) => {
      console.log('🔇 Avatar stopped talking:', event);
      this.onStateChange?.({ phase: 'listening' });

      // Emit custom event for VAD control with delay to ensure state is updated
      if (this.videoElement) {
        setTimeout(() => {
          this.videoElement?.dispatchEvent(new CustomEvent('avatar_stop_talking', { detail: event }));
        }, 100);
      }
    });

    this.streamingAvatar.on(StreamingEvents.USER_START, (event) => {
      console.log('👤 User interaction started:', event);
    });

    this.streamingAvatar.on(StreamingEvents.USER_STOP, (event) => {
      console.log('👤 User interaction stopped:', event);
    });
  }

  async speakAgentResponse(text: string): Promise<void> {
    if (!this.streamingAvatar) {
      throw new Error('StreamingAvatar not initialized');
    }

    console.log(`🎤 Enviando respuesta del agente: "${text}"`);
    this.onStateChange?.({ phase: 'speaking' });

    try {
      await this.streamingAvatar.speak({ 
        text: text,
        task_type: TaskType.REPEAT,
        taskMode: TaskMode.SYNC 
      });

      console.log('✅ Agent response sent to avatar successfully');
    } catch (error) {
      console.error('❌ Failed to send agent response:', error);
      this.onStateChange?.({ 
        phase: 'error', 
        error: error instanceof Error ? error.message : 'Failed to speak' 
      });
      throw error;
    }
  }

  async startVoiceChat(): Promise<void> {
    if (!this.streamingAvatar) {
      throw new Error('StreamingAvatar not initialized');
    }

    try {
      await this.streamingAvatar.startVoiceChat();
      console.log('🎙️ Voice chat started');
    } catch (error) {
      console.error('❌ Failed to start voice chat:', error);
      throw error;
    }
  }

  async endVoiceChat(): Promise<void> {
    if (!this.streamingAvatar) {
      return;
    }

    try {
      await this.streamingAvatar.endVoiceChat();
      console.log('🔇 Voice chat ended');
    } catch (error) {
      console.error('❌ Failed to end voice chat:', error);
    }
  }

  async close(): Promise<void> {
    console.log('🛑 Closing StreamingAvatar...');

    if (this.streamingAvatar) {
      try {
        await this.streamingAvatar.closeVoiceChat();
        console.log('✅ StreamingAvatar closed successfully');
      } catch (error) {
        console.warn('⚠️ Error closing StreamingAvatar:', error);
      }
      this.streamingAvatar = null;
    }

    // Cleanup backend session
    if (this.sessionToken) {
      try {
        await fetch('/api/avatar/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: this.sessionToken })
        });
      } catch (error) {
        console.warn('⚠️ Error closing backend session:', error);
      }
    }

    // Reset state
    this.sessionToken = null;
    this.videoElement = null;

    this.onStateChange?.({ 
      phase: 'initializing',
      isConnected: false,
      error: null,
      sessionToken: null
    });
  }

  isReady(): boolean {
    return this.streamingAvatar !== null;
  }

  getSessionToken(): string | null {
    return this.sessionToken;
  }
}