import fetch from 'node-fetch';

export interface HeyGenSessionData {
  sessionId: string;
  sessionToken: string;
  streamUrl: string;
  previewUrl: string;
  estimatedReadyTime: number;
}

export interface HeyGenStreamingSession {
  session_id: string;
  session_token: string;
  server_url: string;
}

export class HeyGenService {
  private apiKey: string;
  private baseUrl = 'https://api.heygen.com/v1';
  private streamingUrl = 'https://api.heygen.com/v1/streaming';
  
  constructor() {
    this.apiKey = process.env.HEYGEN_API_KEY!;
    if (!this.apiKey) {
      throw new Error('HEYGEN_API_KEY is required');
    }
  }

  async createStreamingSession(avatarId?: string): Promise<HeyGenSessionData> {
    try {
      const response = await fetch(`${this.streamingUrl}.new`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quality: 'high',
          avatar_name: avatarId || 'josh_lite3_20230714', // Default avatar
          voice: {
            voice_id: 'es-ES-AlvaroNeural', // Spanish voice
            rate: 1.0,
            emotion: 'Friendly'
          }
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HeyGen API error: ${response.status} - ${error}`);
      }

      const data = await response.json() as { data: HeyGenStreamingSession };
      
      return {
        sessionId: data.data.session_id,
        sessionToken: data.data.session_token,
        streamUrl: data.data.server_url,
        previewUrl: this.getPreviewUrl(avatarId || 'josh_lite3_20230714'),
        estimatedReadyTime: 2000 // 2 seconds
      };
    } catch (error) {
      console.error('Error creating HeyGen session:', error);
      throw new Error('Failed to create streaming session');
    }
  }

  async sendTextToSpeech(text: string, sessionId: string): Promise<void> {
    try {
      const response = await fetch(`${this.streamingUrl}.task`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          text: text,
          task_type: 'talk'
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HeyGen TTS error: ${response.status} - ${error}`);
      }
    } catch (error) {
      console.error('Error sending TTS to HeyGen:', error);
      throw new Error('Failed to send text to avatar');
    }
  }

  async startSession(sessionId: string): Promise<void> {
    try {
      const response = await fetch(`${this.streamingUrl}.start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HeyGen start session error: ${response.status} - ${error}`);
      }
    } catch (error) {
      console.error('Error starting HeyGen session:', error);
      throw new Error('Failed to start streaming session');
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    try {
      const response = await fetch(`${this.streamingUrl}.stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId
        }),
      });

      if (!response.ok) {
        console.warn(`Failed to close HeyGen session: ${response.status}`);
      }
    } catch (error) {
      console.warn('Error closing HeyGen session:', error);
    }
  }

  async sendGreeting(sessionId: string): Promise<void> {
    const greeting = "¡Hola! Soy el Dr. Carlos Mendoza, psicólogo clínico. Me alegra conocerte. ¿En qué puedo ayudarte hoy?";
    await this.sendTextToSpeech(greeting, sessionId);
  }

  private getPreviewUrl(avatarId: string): string {
    // Return a preview URL for the avatar (static image or short video loop)
    return `/api/avatar/preview/${avatarId}`;
  }

  async getAvatarList(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/avatar.list`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        console.warn('Could not fetch avatar list, using default');
        return ['josh_lite3_20230714'];
      }

      const data = await response.json() as { data: { avatars: Array<{ avatar_id: string }> } };
      return data.data.avatars.map(avatar => avatar.avatar_id);
    } catch (error) {
      console.warn('Error fetching avatars:', error);
      return ['josh_lite3_20230714']; // Fallback
    }
  }
}