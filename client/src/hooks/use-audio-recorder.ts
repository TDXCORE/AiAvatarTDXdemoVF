import { useState, useCallback, useRef } from 'react';
import { AudioUtils } from '@/lib/audio-utils';
import { AudioRecordingResult } from '@/types/voice';

interface SmartRecordingConfig {
  autoStart: boolean;           // Inicio automático por VAD
  autoStop: boolean;            // Parada automática por VAD
  maxDuration: number;          // 30 segundos máximo
  minDuration: number;          // 0.5 segundos mínimo
  silenceDetection: boolean;    // Detección de silencios
  voiceEnhancement: boolean;    // Mejoras de audio para voz
}

interface AudioRecorderOptions {
  onRecordingStart?: () => void;
  onRecordingStop?: (result: AudioRecordingResult) => void;
  onError?: (error: string) => void;
  smartConfig?: Partial<SmartRecordingConfig>;
}

export function useAudioRecorder(options: AudioRecorderOptions = {}) {
  const { onRecordingStart, onRecordingStop, onError, smartConfig = {} } = options;

  // Configuración inteligente por defecto
  const config: SmartRecordingConfig = {
    autoStart: true,
    autoStop: true,
    maxDuration: 30000, // 30 segundos
    minDuration: 500,   // 0.5 segundos
    silenceDetection: true,
    voiceEnhancement: true,
    ...smartConfig
  };

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const maxRecordingTime = 30000; // 30 segundos máximo
  const externalStreamRef = useRef<MediaStream | null>(null); // Add a ref to store external stream
  const useExternalStream = false;

  const startRecording = useCallback(async () => {
    try {
      if (isRecording) return false;

      const hasPermission = await AudioUtils.checkMicrophonePermission();
      if (!hasPermission) {
        onError?.('Microphone permission denied. Please allow access and try again.');
        return false;
      }

      let stream: MediaStream;

      if (externalStreamRef.current) {
        console.log('🎤 Recorder: Usando stream externo del VAD');
        stream = externalStreamRef.current;
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: config.voiceEnhancement,
            noiseSuppression: config.voiceEnhancement,
            autoGainControl: config.voiceEnhancement,
            sampleRate: 16000,  // Optimizado para voz
            channelCount: 1,    // Mono para voz
            volume: 1.0,
            // Configuraciones adicionales para calidad de voz
            googEchoCancellation: config.voiceEnhancement,
            googAutoGainControl: config.voiceEnhancement,
            googNoiseSuppression: config.voiceEnhancement,
            googHighpassFilter: true,
          }
        });
      }


      const recorder = await AudioUtils.startRecording(stream);
      if (!recorder) {
        onError?.('Failed to start recording. Please check your microphone.');
        return false;
      }

      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setRecordingDuration(0);

      // Update duration every second
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingDuration(elapsed);
      }, 1000);

      // Timeout de seguridad para evitar grabaciones muy largas
      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          console.warn('⚠️ Recording timeout reached, stopping...');
          stopRecording();
        }
      }, maxRecordingTime);

      onRecordingStart?.();
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      onError?.('Failed to start recording. Please try again.');
      return false;
    }
  }, [isRecording, onRecordingStart, onError, config, useExternalStream]);

  // 🔥 MÉTODO PARA RECIBIR STREAM EXTERNO DEL VAD
  const setExternalStream = useCallback((stream: MediaStream) => {
    console.log('🎤 Recorder: Recibiendo stream externo del VAD');
    externalStreamRef.current = stream;
  }, []);

  const stopRecording = useCallback(async () => {
    if (!isRecording || !mediaRecorderRef.current) return null;

    try {
      setIsRecording(false);

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }

      const audioBlob = await AudioUtils.stopRecording();
      if (!audioBlob) {
        onError?.('Failed to process recording.');
        return null;
      }

      // Validate recording quality
      if (audioBlob.size < 1000) {
        onError?.('Recording too short. Please speak for at least 1 second.');
        return null;
      }

      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);

      console.log('🎤 Recording completed:', {
        size: audioBlob.size,
        duration: duration,
        type: audioBlob.type
      });

      const result: AudioRecordingResult = {
        audioBlob,
        duration,
      };

      onRecordingStop?.(result);
      mediaRecorderRef.current = null;
      setRecordingDuration(0);

      return result;
    } catch (error) {
      console.error('❌ Failed to stop recording:', error);
      onError?.('Failed to stop recording. Please try again.');
      return null;
    }
  }, [isRecording, onRecordingStop, onError]);

  const cancelRecording = useCallback(async () => {
    if (!isRecording) return;

    setIsRecording(false);

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    if (mediaRecorderRef.current?.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }

    mediaRecorderRef.current = null;
    setRecordingDuration(0);
  }, [isRecording]);

  return {
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording,
    setExternalStream //expose new method
  };
}