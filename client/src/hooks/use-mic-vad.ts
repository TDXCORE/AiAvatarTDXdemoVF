
import { useState, useEffect, useCallback, useRef } from 'react';
import { useCallState } from '@/contexts/call-context';
import MicVADSingleton from '@/lib/mic-vad';

export interface UseMicVADOptions {
  onSpeechEnd?: (audioBlob: Blob) => Promise<void>;
  onSpeechStart?: () => void;
  onInterrupt?: () => void;
  onVADMisfire?: () => void;
  autoStart?: boolean;
}

export interface UseMicVADReturn {
  isReady: boolean;
  isListening: boolean;
  error: string | null;
  startListening: () => Promise<void>;
  pauseListening: () => Promise<void>;
  destroy: () => Promise<void>;
}

export const useMicVAD = (options: UseMicVADOptions = {}): UseMicVADReturn => {
  const { state, dispatch } = useCallState();
  const [isReady, setIsReady] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsubscribersRef = useRef<(() => void)[]>([]);
  const initializingRef = useRef(false);

  const {
    onSpeechEnd,
    onSpeechStart,
    onInterrupt,
    onVADMisfire,
    autoStart = true
  } = options;

  // Initialize MicVAD
  const initialize = useCallback(async () => {
    if (initializingRef.current || isReady) return;
    
    initializingRef.current = true;
    setError(null);

    try {
      console.log('🎤 Initializing MicVAD hook...');
      
      await MicVADSingleton.getInstance();
      
      // Set up event listeners
      const unsubscribeSpeechStart = MicVADSingleton.onSpeechStart(() => {
        console.log('🎤 Hook: Speech started');
        onSpeechStart?.();
        
        // If avatar is speaking, this is an interrupt
        if (state.phase === 'speaking') {
          console.log('🎤 User interrupt detected');
          onInterrupt?.();
        }
      });

      const unsubscribeSpeechEnd = MicVADSingleton.onSpeechEnd(async (audioData: Float32Array) => {
        console.log('🎤 Hook: Speech ended, processing audio...');
        
        try {
          const audioBlob = MicVADSingleton.audioToWavBlob(audioData);
          console.log('🎤 Audio converted to WAV blob:', {
            size: audioBlob.size,
            type: audioBlob.type
          });
          
          if (onSpeechEnd) {
            await onSpeechEnd(audioBlob);
          }
        } catch (error) {
          console.error('🎤 Failed to process speech end:', error);
          setError(error instanceof Error ? error.message : 'Speech processing failed');
        }
      });

      const unsubscribeReady = MicVADSingleton.onReady(() => {
        console.log('🎤 MicVAD ready');
        setIsReady(true);
      });

      // Store unsubscribers
      unsubscribersRef.current = [
        unsubscribeSpeechStart,
        unsubscribeSpeechEnd,
        unsubscribeReady
      ];

      // If already ready, set state immediately
      if (MicVADSingleton.isReady()) {
        setIsReady(true);
      }

    } catch (error) {
      console.error('❌ Failed to initialize MicVAD hook:', error);
      setError(error instanceof Error ? error.message : 'Initialization failed');
    } finally {
      initializingRef.current = false;
    }
  }, [onSpeechEnd, onSpeechStart, onInterrupt, state.phase]);

  // Start listening
  const startListening = useCallback(async () => {
    if (!isReady) {
      console.warn('🎤 MicVAD not ready, cannot start listening');
      return;
    }

    try {
      await MicVADSingleton.start();
      setIsListening(true);
      console.log('🎤 MicVAD listening started');
    } catch (error) {
      console.error('❌ Failed to start MicVAD listening:', error);
      setError(error instanceof Error ? error.message : 'Failed to start listening');
    }
  }, [isReady]);

  // Pause listening
  const pauseListening = useCallback(async () => {
    try {
      await MicVADSingleton.pause();
      setIsListening(false);
      console.log('🎤 MicVAD listening paused');
    } catch (error) {
      console.error('❌ Failed to pause MicVAD:', error);
    }
  }, []);

  // Destroy MicVAD
  const destroy = useCallback(async () => {
    console.log('🛑 Destroying MicVAD hook...');
    
    // Clean up event listeners
    unsubscribersRef.current.forEach(unsubscribe => unsubscribe());
    unsubscribersRef.current = [];
    
    try {
      await MicVADSingleton.destroy();
    } catch (error) {
      console.error('❌ Failed to destroy MicVAD:', error);
    }
    
    setIsReady(false);
    setIsListening(false);
    setError(null);
  }, []);

  // Auto-management based on call state
  useEffect(() => {
    const shouldBeListening = (
      state.isCallActive &&
      !state.isMuted &&
      state.phase === 'listening' &&
      state.avatarConnected &&
      autoStart
    );

    const shouldBePaused = (
      state.phase === 'speaking' ||
      state.isMuted ||
      !state.isCallActive ||
      !state.avatarConnected
    );

    console.log('🎤 MicVAD auto-management:', {
      shouldBeListening,
      shouldBePaused,
      isReady,
      isListening,
      phase: state.phase,
      isCallActive: state.isCallActive,
      isMuted: state.isMuted,
      avatarConnected: state.avatarConnected
    });

    if (shouldBeListening && isReady && !isListening) {
      startListening();
    } else if (shouldBePaused && isListening) {
      pauseListening();
    }
  }, [
    state.isCallActive,
    state.isMuted,
    state.phase,
    state.avatarConnected,
    isReady,
    isListening,
    autoStart,
    startListening,
    pauseListening
  ]);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Update listening state from singleton
  useEffect(() => {
    const checkListeningState = () => {
      const actuallyListening = MicVADSingleton.isListening();
      if (actuallyListening !== isListening) {
        setIsListening(actuallyListening);
      }
    };

    const interval = setInterval(checkListeningState, 1000);
    return () => clearInterval(interval);
  }, [isListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't destroy singleton on unmount, other components might be using it
      // Just clean up our event listeners
      unsubscribersRef.current.forEach(unsubscribe => unsubscribe());
    };
  }, []);

  return {
    isReady,
    isListening,
    error,
    startListening,
    pauseListening,
    destroy
  };
};

export default useMicVAD;
