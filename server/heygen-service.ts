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
      // Force cleanup all existing sessions first
      await this.forceCleanupAllSessions();
      
      const response = await fetch(`${this.streamingUrl}.new`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quality: 'high',
          avatar_name: avatarId || 'josh_lite3_20230714', // Public avatar
          voice: {
            voice_id: '08284d3fc63a424fbe80cc1864ed2540', // Dario - Natural (Spanish Male, Interactive Avatar Compatible)
            rate: 1.0
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('HeyGen API error:', response.status, '-', errorText);
        
        // If concurrent limit reached, try aggressive cleanup and retry
        if (response.status === 400 && errorText.includes('Concurrent limit reached')) {
          console.log('Concurrent limit reached, doing aggressive cleanup and retry...');
          await this.forceCleanupAllSessions();
          
          // Wait 3 seconds and retry
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          const retryResponse = await fetch(`${this.streamingUrl}.new`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              quality: 'high',
              avatar_name: avatarId || 'josh_lite3_20230714',
              voice: {
                voice_id: '08284d3fc63a424fbe80cc1864ed2540',
                rate: 1.0
              }
            }),
          });
          
          if (!retryResponse.ok) {
            const retryErrorText = await retryResponse.text();
            console.error('HeyGen retry failed:', retryResponse.status, '-', retryErrorText);
            throw new Error(`HeyGen API error after cleanup retry: ${retryResponse.status} - ${retryErrorText}`);
          }
          
          const retryData = await retryResponse.json() as { data: HeyGenStreamingSession };
          console.log('HeyGen session created successfully after retry');
          return {
            sessionId: retryData.data.session_id,
            sessionToken: retryData.data.session_token,
            streamUrl: retryData.data.server_url,
            previewUrl: this.getPreviewUrl(avatarId || 'josh_lite3_20230714'),
            estimatedReadyTime: 30000
          };
        }
        
        console.error('HeyGen API error details:', errorText);
        throw new Error(`HeyGen API error: ${response.status} - ${errorText}`);
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
    // For basic text-to-speech functionality, we don't need to "start" the session
    // HeyGen sessions are ready to receive text immediately after creation
    console.log(`Session ${sessionId} ready for text-to-speech`);
    return Promise.resolve();
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

  async forceCleanupAllSessions(): Promise<void> {
    console.log('Force cleaning up all HeyGen sessions...');
    
    // Updated list including recent problematic session IDs
    const potentialSessionIds = [
      'fe0fc279-4a36-11f0-ba0d-5e3b6a3b504d',
      '91aca4d4-4a3a-11f0-b3da-5e0a6fe58bfa',
      '108e6f3a-4a3a-11f0-b3da-5e0a6fe58bfa',
      'session_1',
      'session_2', 
      'session_3',
      'session_4',
      'session_5'
    ];
    
    for (const sessionId of potentialSessionIds) {
      try {
        const response = await fetch(`${this.streamingUrl}.stop`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ session_id: sessionId }),
        });
        
        if (response.ok) {
          console.log(`Cleaned session: ${sessionId}`);
        }
      } catch (error) {
        // Ignore errors for non-existent sessions
      }
    }
    
    // Wait 2 seconds after cleanup to ensure HeyGen's backend processes the closures
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Force cleanup completed with wait period');
  }

  private getPreviewUrl(avatarId: string): string {
    // Return HeyGen's actual preview URL
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