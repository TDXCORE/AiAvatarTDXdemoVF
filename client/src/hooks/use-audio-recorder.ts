import { useState, useCallback, useRef } from 'react';
import { AudioUtils } from '@/lib/audio-utils';
import { AudioRecordingResult } from '@/types/voice';

interface UseAudioRecorderOptions {
  onRecordingStart?: () => void;
  onRecordingStop?: (result: AudioRecordingResult) => void;
  onError?: (error: string) => void;
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const { onRecordingStart, onRecordingStop, onError } = options;

  const startRecording = useCallback(async () => {
    try {
      if (isRecording) return false;

      const hasPermission = await AudioUtils.checkMicrophonePermission();
      if (!hasPermission) {
        onError?.('Microphone permission denied. Please allow access and try again.');
        return false;
      }

      const recorder = await AudioUtils.startRecording();
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

      onRecordingStart?.();
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      onError?.('Failed to start recording. Please try again.');
      return false;
    }
  }, [isRecording, onRecordingStart, onError]);

  const stopRecording = useCallback(async () => {
    if (!isRecording || !mediaRecorderRef.current) return null;

    try {
      setIsRecording(false);

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      const audioBlob = await AudioUtils.stopRecording();
      if (!audioBlob) {
        onError?.('Failed to process recording.');
        return null;
      }

      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const result: AudioRecordingResult = {
        audioBlob,
        duration,
      };

      onRecordingStop?.(result);
      mediaRecorderRef.current = null;
      setRecordingDuration(0);

      return result;
    } catch (error) {
      console.error('Failed to stop recording:', error);
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
  };
}