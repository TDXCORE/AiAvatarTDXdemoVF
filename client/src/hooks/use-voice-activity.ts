import { useState, useEffect, useRef, useCallback } from 'react';
import { VoiceActivityResult } from '@/types/voice';

interface UseVoiceActivityOptions {
  sensitivity?: number;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onVoiceActivity?: (result: VoiceActivityResult) => void;
}

export function useVoiceActivity(options: UseVoiceActivityOptions = {}) {
  const [isActive, setIsActive] = useState(false);
  const [vadDetected, setVadDetected] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const vadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    sensitivity = 70,
    onSpeechStart,
    onSpeechEnd,
    onVoiceActivity,
  } = options;

  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate RMS (Root Mean Square) for voice activity detection
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / bufferLength);
    
    // More sensitive threshold calculation
    const threshold = Math.max(10, (sensitivity / 100) * 30); // Min threshold of 10
    const isVoiceDetected = rms > threshold;
    
    // Log for debugging
    if (rms > 5) { // Only log when there's some audio
      console.log(`🎤 Audio RMS: ${rms.toFixed(1)}, Threshold: ${threshold.toFixed(1)}, Voice: ${isVoiceDetected}`);
    }
    
    const result: VoiceActivityResult = {
      isActive: isVoiceDetected,
      confidence: Math.min(rms / threshold, 1),
      timestamp: Date.now(),
    };

    if (isVoiceDetected !== vadDetected) {
      setVadDetected(isVoiceDetected);
      console.log(`🎤 VAD state changed: ${isVoiceDetected ? 'SPEECH DETECTED' : 'SPEECH ENDED'}`);
      
      if (isVoiceDetected) {
        onSpeechStart?.();
      } else {
        // Add a small delay before calling onSpeechEnd to avoid false negatives
        if (vadTimeoutRef.current) {
          clearTimeout(vadTimeoutRef.current);
        }
        vadTimeoutRef.current = setTimeout(() => {
          onSpeechEnd?.();
        }, 800); // Increased timeout for better stability
      }
    }

    if (isVoiceDetected && vadTimeoutRef.current) {
      clearTimeout(vadTimeoutRef.current);
      vadTimeoutRef.current = null;
    }

    onVoiceActivity?.(result);

    if (isActive) {
      animationFrameRef.current = requestAnimationFrame(analyzeAudio);
    }
  }, [isActive, vadDetected, sensitivity, onSpeechStart, onSpeechEnd, onVoiceActivity]);

  const startListening = useCallback(async () => {
    try {
      console.log('🎤 Starting voice activity detection...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          sampleSize: 16
        },
      });

      console.log('🎤 Audio stream obtained');

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.3; // More responsive
      analyserRef.current.minDecibels = -90;
      analyserRef.current.maxDecibels = -10;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      streamRef.current = stream;
      setIsActive(true);
      
      console.log('🎤 VAD initialized successfully');
      
      // Start analyzing
      analyzeAudio();
      
      return true;
    } catch (error) {
      console.error('❌ Failed to start voice activity detection:', error);
      return false;
    }
  }, [analyzeAudio]);

  const stopListening = useCallback(() => {
    setIsActive(false);
    setVadDetected(false);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (vadTimeoutRef.current) {
      clearTimeout(vadTimeoutRef.current);
      vadTimeoutRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isActive,
    vadDetected,
    startListening,
    stopListening,
  };
}
