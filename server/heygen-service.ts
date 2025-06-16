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
          avatar_name: avatarId || 'Dexter_Doctor_Standing2_public', // Dr. Carlos avatar
          voice: {
            voice_id: '08284d3fc63a424fbe80cc1864ed2540', // Dario - Natural (Spanish Male, Interactive Avatar Compatible)
            rate: 1.0
          },
          task_type: "TALK" // Usar TALK para streaming normal
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
              avatar_name: avatarId || 'Dexter_Doctor_Standing2_public',
              voice: {
                voice_id: '08284d3fc63a424fbe80cc1864ed2540',
                rate: 1.0
              },
              task_type: "TALK" // Usar TALK para streaming normal
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
          task_type: 'TALK' // Cambio a REPEAT mode
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
      // Initialize the streaming session with proper WebRTC handshake
      const response = await fetch(`${this.streamingUrl}.start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          sdp: {
            type: "offer",
            sdp: "v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS\r\nm=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99 100 101 102 121 127 120 125 107 108 109 124 119 123 118 114 115 116\r\nc=IN IP4 0.0.0.0\r\na=rtcp:9 IN IP4 0.0.0.0\r\na=ice-ufrag:4ZcD\r\na=ice-pwd:++jy5Fz2Bt9vNn9B6Q4F4j\r\na=ice-options:trickle\r\na=fingerprint:sha-256 8C:B8:C0:AB:B0:70:C2:42:47:52:4E:CA:B9:B3:84:34:83:A0:EC:B8:23:39:83:44:54:BB:AF:1A:BF:AC:BC:8F\r\na=setup:actpass\r\na=mid:0\r\na=extmap:1 urn:ietf:params:rtp-hdrext:toffset\r\na=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\na=extmap:3 urn:3gpp:video-orientation\r\na=extmap:4 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\na=extmap:5 http://www.webrtc.org/experiments/rtp-hdrext/playout-delay\r\na=extmap:6 http://www.webrtc.org/experiments/rtp-hdrext/video-content-type\r\na=extmap:7 http://www.webrtc.org/experiments/rtp-hdrext/video-timing\r\na=extmap:8 http://www.webrtc.org/experiments/rtp-hdrext/color-space\r\na=extmap:9 urn:ietf:params:rtp-hdrext:sdes:mid\r\na=extmap:10 urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id\r\na=extmap:11 urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id\r\na=sendrecv\r\na=msid:- \r\na=rtcp-mux\r\na=rtcp-rsize\r\na=rtpmap:96 VP8/90000\r\na=rtcp-fb:96 goog-remb\r\na=rtcp-fb:96 transport-cc\r\na=rtcp-fb:96 ccm fir\r\na=rtcp-fb:96 nack\r\na=rtcp-fb:96 nack pli\r\na=rtpmap:97 rtx/90000\r\na=fmtp:97 apt=96\r\na=rtpmap:98 VP9/90000\r\na=rtcp-fb:98 goog-remb\r\na=rtcp-fb:98 transport-cc\r\na=rtcp-fb:98 ccm fir\r\na=rtcp-fb:98 nack\r\na=rtcp-fb:98 nack pli\r\na=fmtp:98 profile-id=0\r\na=rtpmap:99 rtx/90000\r\na=fmtp:99 apt=98\r\na=rtpmap:100 VP9/90000\r\na=rtcp-fb:100 goog-remb\r\na=rtcp-fb:100 transport-cc\r\na=rtcp-fb:100 ccm fir\r\na=rtcp-fb:100 nack\r\na=rtcp-fb:100 nack pli\r\na=fmtp:100 profile-id=2\r\na=rtpmap:101 rtx/90000\r\na=fmtp:101 apt=100\r\na=rtpmap:102 H264/90000\r\na=rtcp-fb:102 goog-remb\r\na=rtcp-fb:102 transport-cc\r\na=rtcp-fb:102 ccm fir\r\na=rtcp-fb:102 nack\r\na=rtcp-fb:102 nack pli\r\na=fmtp:102 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f\r\na=rtpmap:121 rtx/90000\r\na=fmtp:121 apt=102\r\na=rtpmap:127 H264/90000\r\na=rtcp-fb:127 goog-remb\r\na=rtcp-fb:127 transport-cc\r\na=rtcp-fb:127 ccm fir\r\na=rtcp-fb:127 nack\r\na=rtcp-fb:127 nack pli\r\na=fmtp:127 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42001f\r\na=rtpmap:120 rtx/90000\r\na=fmtp:120 apt=127\r\na=rtpmap:125 H264/90000\r\na=rtcp-fb:125 goog-remb\r\na=rtcp-fb:125 transport-cc\r\na=rtcp-fb:125 ccm fir\r\na=rtcp-fb:125 nack\r\na=rtcp-fb:125 nack pli\r\na=fmtp:125 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r\na=rtpmap:107 rtx/90000\r\na=fmtp:107 apt=125\r\na=rtpmap:108 H264/90000\r\na=rtcp-fb:108 goog-remb\r\na=rtcp-fb:108 transport-cc\r\na=rtcp-fb:108 ccm fir\r\na=rtcp-fb:108 nack\r\na=rtcp-fb:108 nack pli\r\na=fmtp:108 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42e01f\r\na=rtpmap:109 rtx/90000\r\na=fmtp:109 apt=108\r\na=rtpmap:124 H264/90000\r\na=rtcp-fb:124 goog-remb\r\na=rtcp-fb:124 transport-cc\r\na=rtcp-fb:124 ccm fir\r\na=rtcp-fb:124 nack\r\na=rtcp-fb:124 nack pli\r\na=fmtp:124 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=4d001f\r\na=rtpmap:119 rtx/90000\r\na=fmtp:119 apt=124\r\na=rtpmap:123 H264/90000\r\na=rtcp-fb:123 goog-remb\r\na=rtcp-fb:123 transport-cc\r\na=rtcp-fb:123 ccm fir\r\na=rtcp-fb:123 nack\r\na=rtcp-fb:123 nack pli\r\na=fmtp:123 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=64001f\r\na=rtpmap:118 rtx/90000\r\na=fmtp:118 apt=123\r\na=rtpmap:114 red/90000\r\na=rtpmap:115 rtx/90000\r\na=fmtp:115 apt=114\r\na=rtpmap:116 ulpfec/90000\r\n"
          }
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('HeyGen start session error:', response.status, '-', error);
        throw new Error(`HeyGen start session error: ${response.status} - ${error}`);
      }

      console.log(`Session ${sessionId} started successfully for streaming`);
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
    console.log('Force cleaning up all HeyGen sessions...');

    // Extended list including all recent session IDs from logs
    const potentialSessionIds = [
      'fe0fc279-4a36-11f0-ba0d-5e3b6a3b504d',
      '91aca4d4-4a3a-11f0-b3da-5e0a6fe58bfa',
      '108e6f3a-4a3a-11f0-b3da-5e0a6fe58bfa',
      'c6998ac7-4a3a-11f0-b08d-227b28e9264f',
      // Common session patterns
      'session_1', 'session_2', 'session_3', 'session_4', 'session_5',
      // Possible leaked sessions
      'josh_lite3_20230714_session',
      'streaming_session_1', 'streaming_session_2'
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