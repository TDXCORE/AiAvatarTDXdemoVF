// Servicio de avatar alternativo que no depende del streaming de HeyGen
// Utiliza la imagen de preview del avatar con TTS alternativo
export interface FallbackAvatarSessionData {
  sessionId: string;
  previewUrl: string;
  estimatedReadyTime: number;
}

export class FallbackAvatarService {
  private activeSessions: Map<string, { id: string; created: Date }> = new Map();

  async createSession(avatarId: string = 'josh_lite3_20230714'): Promise<FallbackAvatarSessionData> {
    const sessionId = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Usar la URL de preview conocida de HeyGen
    const previewUrl = `https://resource.heygen.ai/avatar/preview/${avatarId}.jpg`;
    
    // Registrar sesión activa
    this.activeSessions.set(sessionId, {
      id: sessionId,
      created: new Date()
    });

    console.log(`Fallback avatar session created: ${sessionId}`);
    
    return {
      sessionId,
      previewUrl,
      estimatedReadyTime: 1000
    };
  }

  async sendTextToSpeech(text: string, sessionId: string): Promise<void> {
    if (!this.activeSessions.has(sessionId)) {
      throw new Error('Session not found');
    }

    // Simular procesamiento de TTS
    console.log(`Fallback TTS for session ${sessionId}: "${text}"`);
    
    // En una implementación real, aquí se usaría un servicio de TTS alternativo
    // como Google Cloud TTS, Azure Cognitive Services, o ElevenLabs
    return Promise.resolve();
  }

  async closeSession(sessionId: string): Promise<void> {
    if (this.activeSessions.has(sessionId)) {
      this.activeSessions.delete(sessionId);
      console.log(`Fallback avatar session closed: ${sessionId}`);
    }
  }

  async sendGreeting(sessionId: string): Promise<void> {
    const greeting = "¡Hola! Soy el Dr. Carlos Mendoza, psicólogo clínico. Me alegra conocerte. ¿En qué puedo ayudarte hoy?";
    await this.sendTextToSpeech(greeting, sessionId);
  }

  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  // Cleanup de sesiones antiguas
  cleanupOldSessions(maxAgeMinutes: number = 30): void {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.created < cutoff) {
        this.activeSessions.delete(sessionId);
        console.log(`Cleaned up old fallback session: ${sessionId}`);
      }
    }
  }
}