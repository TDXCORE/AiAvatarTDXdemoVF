export interface AvatarState {
  phase: 'initializing' | 'preview' | 'connecting' | 'ready' | 'listening' | 'speaking' | 'error';
  isConnected: boolean;
  sessionId: string | null;
  streamUrl: string | null;
  previewUrl: string | null;
  error: string | null;
  progress: number;
}

export interface AvatarSessionData {
  sessionId: string;
  sessionToken: string;
  streamUrl: string;
  previewUrl: string;
  estimatedReadyTime: number;
}

export interface AvatarControlsProps {
  avatarState: AvatarState;
  onStartCall: () => void;
  onEndCall: () => void;
  onMuteToggle: () => void;
  isMuted: boolean;
}

export interface AvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  onAudioMessage: (audioBlob: Blob) => void;
}