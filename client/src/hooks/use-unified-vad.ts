
import { useEffect, useRef } from 'react';
import { useCallState } from '@/contexts/call-context';
import { useVoiceActivity } from './use-voice-activity';
import { useAudioRecorder } from './use-audio-recorder';

export const useUnifiedVAD = (onAudioProcessed: (audioBlob: Blob) => Promise<void>) => {
  const { state } = useCallState();
  const vadSingletonRef = useRef<boolean>(false);
  const initializationLockRef = useRef<boolean>(false);

  // Single VAD instance with calibrated settings según guía
  const vad = useVoiceActivity({
    sensitivity: 75,
    speechStartThreshold: 80,   // Según guía
    speechEndThreshold: 280,    // Según guía (280ms)
    minimumRecordingDuration: 250, // Permite palabras cortas
    autoRecordingEnabled: true,
    continuousListening: true,
    onSpeechStart: () => {
      console.log('🎤 Unified VAD: Speech detected - starting recording');
      if (shouldActivateRecording()) {
        recorder.startRecording();
      }
    },
    onSpeechEnd: () => {
      console.log('🎤 Unified VAD: Speech ended - stopping recording');
      if (recorder.isRecording) {
        recorder.stopRecording();
      }
    },
  });

  // Single recorder instance
  const recorder = useAudioRecorder({
    onRecordingStop: async (result) => {
      if (result.audioBlob) {
        await onAudioProcessed(result.audioBlob);
      }
    },
    onError: (error) => {
      console.error('Unified VAD recording error:', error);
    },
  });

  const shouldActivateRecording = () => {
    return (
      state.isCallActive &&
      !state.isMuted &&
      state.phase === 'listening' &&
      state.avatarConnected &&
      !recorder.isRecording
    );
  };

  // Main VAD control logic
  useEffect(() => {
    const shouldVADBeActive = (
      state.isCallActive &&
      !state.isMuted &&
      state.phase === 'listening' &&
      state.avatarConnected
    );

    console.log('🎤 VAD activation check:', {
      shouldVADBeActive,
      isCallActive: state.isCallActive,
      isMuted: state.isMuted,
      phase: state.phase,
      avatarConnected: state.avatarConnected,
      currentlyListening: vad.isListening,
      singletonActive: vadSingletonRef.current
    });

    if (shouldVADBeActive && !vad.isListening && !vadSingletonRef.current && !initializationLockRef.current) {
      console.log('🎤 Starting unified VAD');
      initializationLockRef.current = true;
      vadSingletonRef.current = true;
      vad.startListening().finally(() => {
        initializationLockRef.current = false;
      });
    } else if (!shouldVADBeActive && vad.isListening && !initializationLockRef.current) {
      console.log('🎤 Stopping unified VAD');
      vadSingletonRef.current = false;
      vad.stopListening();
    }
  }, [state.isCallActive, state.isMuted, state.phase, state.avatarConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vadSingletonRef.current) {
        vad.stopListening();
        vadSingletonRef.current = false;
      }
    };
  }, []);

  return {
    vad,
    recorder,
    isVADActive: vad.isListening,
  };
};
