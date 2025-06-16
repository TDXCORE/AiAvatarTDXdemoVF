
// Simple avatar client con validación robusta y retry logic
export interface SimpleAvatarState {
  phase: 'initializing' | 'validating' | 'ready' | 'speaking' | 'listening' | 'error';
  sessionId: string | null;
  previewUrl: string | null;
  error: string | null;
  isConnected: boolean;
  isValidated: boolean;
  webrtcEstablished: boolean;
}

export class SimpleAvatarClient {
  private sessionId: string | null = null;
  private token: string | null = null;
  private isHeyGenSession: boolean = false;
  private onStateChange?: (state: Partial<SimpleAvatarState>) => void;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(onStateChange?: (state: Partial<SimpleAvatarState>) => void) {
    this.onStateChange = onStateChange;
  }

  async initialize(): Promise<void> {
    try {
      this.onStateChange?.({ phase: 'initializing' });

      // 1. Limpiar sesiones anteriores
      await this.cleanup();

      // 2. Crear token para hygiene
      await this.createToken();

      // 3. Crear sesión HeyGen robusta con validación
      await this.createRobustSession();

      // 4. Validar que la sesión está lista
      await this.validateSessionReady();

      // 5. Iniciar monitoreo de salud
      this.startHealthMonitoring();

      console.log('🎉 Avatar client inicializado exitosamente');
    } catch (error) {
      console.error('❌ Error inicializando avatar client:', error);
      this.onStateChange?.({ 
        phase: 'error', 
        error: error instanceof Error ? error.message : 'Initialization failed',
        isConnected: false,
        isValidated: false
      });
      throw error;
    }
  }

  private async createToken(): Promise<void> {
    try {
      const tokenResponse = await fetch('/api/avatar/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (tokenResponse.ok) {
        const tokenResult = await tokenResponse.json();
        this.token = tokenResult.token;
        console.log('✅ Token creado para hygiene de sesión');
      }
    } catch (error) {
      console.warn('⚠️ No se pudo crear token (no crítico):', error);
    }
  }

  private async createRobustSession(): Promise<void> {
    this.onStateChange?.({ phase: 'validating' });

    const response = await fetch('/api/avatar/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        avatarId: 'Dexter_Doctor_Standing2_public',
        forceHeyGen: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to create session: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || 'Session creation failed');
    }

    // Verificar que la sesión es HeyGen real y está validada
    if (!result.data.isHeyGen || !result.data.isValidated) {
      throw new Error('Session is not a validated HeyGen session');
    }

    this.sessionId = result.data.sessionId;
    this.isHeyGenSession = result.data.isHeyGen;
    
    console.log(`✅ Sesión HeyGen robusta creada: ${this.sessionId}`);
    console.log(`✅ WebRTC establecido: ${result.data.webrtcEstablished}`);
    console.log(`✅ Sesión validada: ${result.data.isValidated}`);

    this.onStateChange?({
      phase: 'ready',
      sessionId: this.sessionId,
      previewUrl: result.data.previewUrl,
      isConnected: result.data.isReady,
      isValidated: result.data.isValidated,
      webrtcEstablished: result.data.webrtcEstablished
    });
  }

  private async validateSessionReady(): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No session to validate');
    }

    console.log('🔍 Validando que la sesión está lista...');

    const response = await fetch('/api/avatar/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (errorData.requiresReconnection) {
        throw new Error('Session requires reconnection - not ready');
      }
      throw new Error(errorData.message || 'Session validation failed');
    }

    console.log('✅ Sesión validada y lista para uso');
  }

  private startHealthMonitoring(): void {
    if (!this.sessionId) return;

    console.log('🔍 Iniciando monitoreo de salud del cliente');
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        if (!this.sessionId) return;
        
        // Ping simple para verificar que la sesión sigue activa
        const response = await fetch('/api/avatar/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: this.sessionId })
        });

        if (!response.ok) {
          console.warn('⚠️ Sesión perdió salud - requiere reconexión');
          this.onStateChange?.({ 
            phase: 'error', 
            error: 'Session lost connection',
            isConnected: false,
            isValidated: false
          });
        }
      } catch (error) {
        console.error('❌ Error en health check:', error);
      }
    }, 30000); // Check cada 30 segundos
  }

  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('🛑 Detenido monitoreo de salud');
    }
  }

  async speak(text: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    console.log(`🎤 Enviando TTS: "${text}"`);
    this.onStateChange?.({ phase: 'speaking' });

    try {
      const response = await fetch('/api/avatar/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          text: text
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (errorData.requiresReconnection) {
          this.onStateChange?.({ 
            phase: 'error', 
            error: 'Session requires reconnection',
            isConnected: false,
            isValidated: false
          });
          throw new Error('Session requires reconnection');
        }
        
        throw new Error(errorData.message || 'Failed to send text to avatar');
      }

      console.log('✅ TTS enviado exitosamente');
      
      // Simular tiempo de habla
      const estimatedSpeechTime = Math.max(text.length * 50, 2000);
      setTimeout(() => {
        this.onStateChange?.({ phase: 'listening' });
      }, estimatedSpeechTime);

    } catch (error) {
      console.error('❌ Error en speak:', error);
      this.onStateChange?.({ 
        phase: 'error', 
        error: error instanceof Error ? error.message : 'Failed to speak' 
      });
      throw error;
    }
  }

  async close(): Promise<void> {
    console.log('🛑 Cerrando avatar client...');
    
    // Detener monitoreo
    this.stopHealthMonitoring();

    // Cerrar sesión
    if (this.sessionId) {
      try {
        await fetch('/api/avatar/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: this.sessionId })
        });
        console.log('✅ Sesión cerrada exitosamente');
      } catch (error) {
        console.warn('⚠️ Error cerrando sesión:', error);
      }
    }

    // Cleanup token
    if (this.token) {
      try {
        await fetch('/api/avatar/token/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: this.token })
        });
      } catch (error) {
        console.warn('⚠️ Error cerrando token:', error);
      }
    }

    // Reset state
    this.sessionId = null;
    this.token = null;
    this.isHeyGenSession = false;
    
    this.onStateChange?.({ 
      phase: 'initializing',
      sessionId: null,
      previewUrl: null,
      error: null,
      isConnected: false,
      isValidated: false,
      webrtcEstablished: false
    });
  }

  private async cleanup(): Promise<void> {
    // Limpiar cualquier sesión anterior
    if (this.sessionId) {
      await this.close();
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  isReady(): boolean {
    return this.sessionId !== null && this.isHeyGenSession;
  }
}
