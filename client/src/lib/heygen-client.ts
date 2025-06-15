import { AvatarSessionData, AvatarState } from "@/types/avatar";
import { apiRequest } from "./queryClient";

export class HeyGenStreamingClient {
  private sessionId: string | null = null;
  private streamUrl: string | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private onStateChange?: (state: Partial<AvatarState>) => void;

  constructor(onStateChange?: (state: Partial<AvatarState>) => void) {
    this.onStateChange = onStateChange;
  }

  async initializeSession(avatarId?: string): Promise<AvatarSessionData> {
    this.updateState({ phase: 'connecting', progress: 30 });

    try {
      const response = await fetch('/api/avatar/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ avatarId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to create avatar session');
      }

      const { data } = await response.json();
      
      if (!data?.sessionId) {
        throw new Error('Invalid session data received');
      }

      this.sessionId = data.sessionId;
      this.streamUrl = data.streamUrl;

      this.updateState({ 
        phase: 'preview', 
        sessionId: data.sessionId,
        streamUrl: data.streamUrl,
        previewUrl: data.previewUrl,
        progress: 60
      });

      return data;
    } catch (error) {
      console.error('Session initialization failed:', error);
      this.updateState({ 
        phase: 'error', 
        error: error instanceof Error ? error.message : 'Failed to initialize session' 
      });
      throw error;
    }
  }

  async startStreaming(videoElement: HTMLVideoElement): Promise<void> {
    if (!this.streamUrl || !this.sessionId) {
      throw new Error('No active session');
    }

    this.videoElement = videoElement;
    this.updateState({ phase: 'connecting', progress: 60 });

    // Start the session first via API
    try {
      const response = await fetch('/api/avatar/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId })
      });

      if (!response.ok) {
        throw new Error('Failed to start session');
      }
    } catch (error) {
      console.error('Start session failed:', error);
      throw error;
    }

    try {
      // Initialize WebRTC connection for HeyGen streaming
      this.peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
        ],
      });

      // Handle incoming stream
      this.peerConnection.ontrack = (event) => {
        if (this.videoElement && event.streams[0]) {
          this.videoElement.srcObject = event.streams[0];
          this.updateState({ 
            phase: 'ready', 
            isConnected: true, 
            progress: 100 
          });
        }
      };

      // Create data channel for communication
      this.dataChannel = this.peerConnection.createDataChannel('heygen');
      
      this.dataChannel.onopen = () => {
        console.log('HeyGen data channel opened');
        this.sendGreeting();
      };

      // Create offer and connect to HeyGen
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // Send offer to HeyGen server (simplified - actual implementation would be more complex)
      // For now, we'll simulate a successful connection
      setTimeout(() => {
        this.updateState({ 
          phase: 'ready', 
          isConnected: true, 
          progress: 100 
        });
      }, 1000);

    } catch (error) {
      this.updateState({ 
        phase: 'error', 
        error: error instanceof Error ? error.message : 'Streaming failed' 
      });
      throw error;
    }
  }

  async sendTextToAvatar(text: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    this.updateState({ phase: 'speaking' });

    try {
      const response = await fetch('/api/avatar/speak', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          sessionId: this.sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send text to avatar');
      }

      // Avatar will start speaking, return to listening after estimated speech time
      const estimatedSpeechTime = text.length * 50; // ~50ms per character
      setTimeout(() => {
        this.updateState({ phase: 'listening' });
      }, estimatedSpeechTime);

    } catch (error) {
      this.updateState({ 
        phase: 'error', 
        error: error instanceof Error ? error.message : 'Failed to speak' 
      });
      throw error;
    }
  }

  async callStartSession(): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    try {
      const response = await fetch('/api/avatar/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId })
      });

      if (!response.ok) {
        throw new Error('Failed to start session');
      }
    } catch (error) {
      console.error('Start session failed:', error);
      throw error;
    }
  }

  async sendGreeting(): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    try {
      await fetch('/api/avatar/greet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
        }),
      });
    } catch (error) {
      console.warn('Failed to send greeting:', error);
    }
  }

  async closeSession(): Promise<void> {
    if (this.sessionId) {
      try {
        await fetch('/api/avatar/close', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: this.sessionId,
          }),
        });
      } catch (error) {
        console.warn('Failed to close avatar session:', error);
      }
    }

    // Clean up WebRTC connections
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.sessionId = null;
    this.streamUrl = null;
    
    this.updateState({ 
      phase: 'initializing',
      isConnected: false,
      sessionId: null,
      streamUrl: null,
      error: null,
      progress: 0
    });
  }

  private updateState(newState: Partial<AvatarState>): void {
    if (this.onStateChange) {
      this.onStateChange(newState);
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  isConnected(): boolean {
    return this.sessionId !== null && this.peerConnection?.connectionState === 'connected';
  }
}