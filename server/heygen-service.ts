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

  async createHeygenToken(): Promise<string> {
    try {
      const response = await fetch(`${this.streamingUrl}.create_token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to create token: ${response.status}`);
      }

      const data = await response.json() as { token: string };
      return data.token;
    } catch (error) {
      console.error('Error creating HeyGen token:', error);
      throw error;
    }
  }

  async sendTextToSpeech(text: string, sessionId: string): Promise<void> {
    try {
      console.log(`📢 Enviando TTS a sesión ${sessionId}: "${text}"`);

      const response = await fetch(`${this.streamingUrl}.task`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          text: text,
          task_type: 'repeat'
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ HeyGen TTS falló: ${response.status} - ${errorText}`);
        throw new Error(`HeyGen TTS error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ TTS enviado exitosamente:', result);
    } catch (error) {
      console.error('Error sending TTS to HeyGen:', error);
      throw new Error('Failed to send text to avatar');
    }
  }

  async closeHeygen(token: string): Promise<void> {
    try {
      await fetch(`${this.streamingUrl}.close_session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token })
      });
      console.log('HeyGen session closed with token:', token);
    } catch (error) {
      console.warn('Failed to close HeyGen session:', error);
    }
  }

  private getPreviewUrl(avatarId: string): string {
    return `https://resource.heygen.ai/avatar/preview/${avatarId}.jpg`;
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
        return ['Dexter_Doctor_Standing2_public'];
      }

      const data = await response.json() as { data: { avatars: Array<{ avatar_id: string }> } };
      return data.data.avatars.map(avatar => avatar.avatar_id);
    } catch (error) {
      console.warn('Error fetching avatars:', error);
      return ['Dexter_Doctor_Standing2_public'];
    }
  }
}