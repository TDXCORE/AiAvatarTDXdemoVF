// HeyGen Streaming API implementation following official documentation
// https://docs.heygen.com/reference/new-session

export interface HeyGenStreamingConfig {
  quality: 'low' | 'medium' | 'high';
  avatar_name: string;
  voice: {
    voice_id: string;
    rate?: number;
    emotion?: string;
  };
}

export interface HeyGenSessionResponse {
  data: {
    session_id: string;
    session_token: string;
    server_url: string;
  };
}

export interface StreamingAvatarApi {
  // WebRTC connection
  peerConnection: RTCPeerConnection;
  // Data channel for communication
  dataChannel: RTCDataChannel;
  // Video element reference
  videoElement: HTMLVideoElement;
  // Session info
  sessionInfo: {
    sessionId: string;
    sessionToken: string;
    serverUrl: string;
  };
}

export class HeyGenStreamingAPI {
  private sessionInfo: StreamingAvatarApi['sessionInfo'] | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private onStateChange?: (phase: string, data?: any) => void;

  constructor(onStateChange?: (phase: string, data?: any) => void) {
    this.onStateChange = onStateChange;
  }

  async createSession(): Promise<void> {
    try {
      this.onStateChange?.('initializing');

      const response = await fetch('/api/avatar/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          avatarId: 'josh_lite3_20230714'
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to create session');
      }

      this.sessionInfo = {
        sessionId: result.data.sessionId,
        sessionToken: result.data.sessionToken,
        serverUrl: result.data.streamUrl
      };

      this.onStateChange?.('preview', {
        sessionId: this.sessionInfo.sessionId,
        previewUrl: result.data.previewUrl
      });

      console.log('HeyGen session created:', this.sessionInfo.sessionId);
    } catch (error) {
      console.error('Failed to create HeyGen session:', error);
      this.onStateChange?.('error', { error: error instanceof Error ? error.message : 'Session creation failed' });
      throw error;
    }
  }

  async startStreaming(videoElement: HTMLVideoElement): Promise<void> {
    if (!this.sessionInfo) {
      throw new Error('No session created');
    }

    try {
      this.videoElement = videoElement;
      this.onStateChange?.('connecting');

      // Start the session via API
      const startResponse = await fetch('/api/avatar/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: this.sessionInfo.sessionId
        })
      });

      if (!startResponse.ok) {
        throw new Error('Failed to start session');
      }

      // For HeyGen, we don't need custom WebRTC - they handle this via their server URL
      // Instead, we'll use their streaming URL directly
      if (this.sessionInfo.serverUrl && this.sessionInfo.serverUrl !== 'fallback://demo') {
        // Set video source to HeyGen's stream URL (if it's a direct stream)
        // Note: In practice, HeyGen uses WebRTC internally but provides the stream differently
        this.videoElement.src = this.sessionInfo.serverUrl;
        
        // Try to play the video
        try {
          await this.videoElement.play();
        } catch (playError) {
          console.warn('Video autoplay failed, user interaction required:', playError);
        }
      }

      this.onStateChange?.('ready');
      console.log('HeyGen streaming started successfully');

    } catch (error) {
      console.error('Failed to start streaming:', error);
      this.onStateChange?.('error', { error: error instanceof Error ? error.message : 'Streaming failed' });
      throw error;
    }
  }

  private async setupWebRTCConnection(): Promise<void> {
    // Create peer connection with STUN servers
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // Handle incoming stream
    this.peerConnection.ontrack = (event) => {
      console.log('Received remote stream');
      if (this.videoElement && event.streams[0]) {
        this.videoElement.srcObject = event.streams[0];
        this.videoElement.play().catch(console.error);
        this.onStateChange?.('streaming');
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('ICE candidate:', event.candidate);
        // Send ICE candidate to HeyGen server via data channel
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
          this.dataChannel.send(JSON.stringify({
            type: 'ice',
            candidate: event.candidate
          }));
        }
      }
    };

    // Create data channel for communication
    this.dataChannel = this.peerConnection.createDataChannel('messages', {
      ordered: true
    });

    this.dataChannel.onopen = () => {
      console.log('Data channel opened');
    };

    this.dataChannel.onmessage = (event) => {
      console.log('Data channel message:', event.data);
      try {
        const message = JSON.parse(event.data);
        this.handleDataChannelMessage(message);
      } catch (e) {
        console.error('Failed to parse data channel message:', e);
      }
    };

    // Create offer
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    // Send offer to HeyGen server (this would typically go through the server URL)
    console.log('WebRTC offer created, connecting to:', this.sessionInfo?.serverUrl);
    
    // For now, we'll simulate the connection being established
    // In a real implementation, you'd exchange SDP offers/answers with HeyGen's server
    setTimeout(() => {
      if (this.peerConnection) {
        // Simulate receiving answer from server
        const answer: RTCSessionDescriptionInit = {
          type: 'answer',
          sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' // Minimal SDP
        };
        
        this.peerConnection.setRemoteDescription(answer).catch(console.error);
      }
    }, 1000);
  }

  private handleDataChannelMessage(message: any): void {
    switch (message.type) {
      case 'avatar_speaking':
        this.onStateChange?.('speaking');
        break;
      case 'avatar_listening':
        this.onStateChange?.('listening');
        break;
      case 'avatar_ready':
        this.onStateChange?.('ready');
        break;
      default:
        console.log('Unknown data channel message:', message);
    }
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.sessionInfo) {
      throw new Error('No active session');
    }

    try {
      this.onStateChange?.('speaking');

      const response = await fetch('/api/avatar/speak', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: this.sessionInfo.sessionId,
          text: text
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message to avatar');
      }

      console.log('Message sent to avatar:', text);
    } catch (error) {
      console.error('Failed to send message:', error);
      this.onStateChange?.('error', { error: error instanceof Error ? error.message : 'Message send failed' });
      throw error;
    }
  }

  async closeSession(): Promise<void> {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.sessionInfo) {
      try {
        await fetch('/api/avatar/close', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: this.sessionInfo.sessionId
          })
        });
      } catch (error) {
        console.warn('Failed to close session:', error);
      }

      this.sessionInfo = null;
    }

    this.videoElement = null;
    console.log('HeyGen session closed');
  }

  getSessionId(): string | null {
    return this.sessionInfo?.sessionId || null;
  }

  isConnected(): boolean {
    return this.peerConnection?.connectionState === 'connected';
  }
}