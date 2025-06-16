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
    // First attempt to cleanup any existing sessions
    await this.forceCleanupAllSessions();
    
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        console.log('🔑 Requesting token from HeyGen API...');
        
        const response = await fetch(`${this.streamingUrl}.create_token`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          
          // Check for concurrent limit error
          if (response.status === 400 && errorText.includes('10007')) {
            console.log(`🧹 Concurrent limit reached, cleaning up sessions (attempt ${retryCount + 1}/${maxRetries})`);
            await this.forceCleanupAllSessions();
            
            if (retryCount < maxRetries - 1) {
              retryCount++;
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
              continue;
            }
          }
          
          console.error(`❌ Token creation failed: ${response.status} - ${errorText}`);
          throw new Error(`Failed to create token: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as { data?: { token: string }, token?: string };
        const token = data.data?.token || data.token;
        
        if (!token) {
          console.error('❌ No token in response:', data);
          throw new Error('Token not found in response');
        }

        console.log('✅ Token created successfully');
        return token;
      } catch (error) {
        if (retryCount === maxRetries - 1) {
          console.error('❌ Error creating HeyGen token after retries:', error);
          throw error;
        }
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error('Failed to create token after all retries');
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

  async forceCleanupAllSessions(): Promise<void> {
    try {
      console.log('🧹 Force cleaning up all HeyGen sessions...');
      
      // Try to close session using list endpoint
      const listResponse = await fetch(`${this.streamingUrl}.list`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        }
      });

      if (listResponse.ok) {
        const listData = await listResponse.json() as { data?: { sessions?: Array<{ session_id: string }> } };
        const sessions = listData.data?.sessions || [];
        
        console.log(`Found ${sessions.length} active sessions to cleanup`);
        
        for (const session of sessions) {
          try {
            await this.closeSessionById(session.session_id);
          } catch (error) {
            // Continue with next session
          }
        }
      }

      // Also try common session cleanup patterns
      const commonSessionIds = [
        'fe0fc279-4a36-11f0-ba0d-5e3b6a3b504d',
        '91aca4d4-4a3a-11f0-b3da-5e0a6fe58bfa',
        '108e6f3a-4a3a-11f0-b3da-5e0a6fe58bfa'
      ];

      for (const sessionId of commonSessionIds) {
        try {
          await this.closeSessionById(sessionId);
        } catch (error) {
          // Continue with next session
        }
      }
      
      console.log('✅ Session cleanup completed');
    } catch (error) {
      console.warn('⚠️ Session cleanup had issues:', error);
    }
  }

  async closeSessionById(sessionId: string): Promise<void> {
    try {
      await fetch(`${this.streamingUrl}.stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionId })
      });
    } catch (error) {
      // Ignore errors for sessions that don't exist
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