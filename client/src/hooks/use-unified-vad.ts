
import { useState, useEffect, useRef, useCallback } from 'react';
import { useCallState } from '@/contexts/call-context';
import { AudioUtils } from '@/lib/audio-utils';
import { AudioRecordingResult } from '@/types/voice';

// Configuración VAD calibrada según guía quirúrgica
const VAD_CONFIG = {
  fftSize: 1024,              
  smoothingTimeConstant: 0.12, 
  minDecibels: -60,           
  maxDecibels: -5,            
  sampleRate: 16000,          
  bufferSize: 2048,           
  
  // Thresholds calibrados para mejor detección de voz
  voiceThreshold: 4,          // Más sensible para voces normales (2-6 RMS)
  silenceThreshold: 2,        // Más sensible para detectar silencios
  
  // Tiempos optimizados para respuesta inmediata
  speechStartDelay: 50,       // Más rápido para detección inmediata
  speechEndDelay: 280,        // Reducido de 350ms → 280ms (acelera turnaround)
  cooldownDelay: 200,         // Reducido de 1000ms → 200ms (crítico: evita congelamiento)
  minimumSpeechDuration: 250, // Mantener para palabras cortas
  
  // Filtros de frecuencia según guía
  voiceFreqMin: 65,           
  voiceFreqMax: 4000,         
};

type VADState = 'idle' | 'detecting' | 'speaking' | 'ending' | 'cooldown';

interface VADBuffer {
  samples: number[];
  timestamps: number[];
  confidence: number[];
  maxSize: number;
}

export const useUnifiedVAD = (onAudioProcessed: (audioBlob: Blob) => Promise<void>) => {
  const { state } = useCallState();

  // 🔥 CONTROL SINGLETON MEJORADO - Evita doble inicialización
  const initializationStateRef = useRef<'idle' | 'initializing' | 'active' | 'stopping'>('idle');
  const vadInstanceRef = useRef<boolean>(false);

  // Estados VAD internos
  const [isListening, setIsListening] = useState(false);
  const [vadState, setVadState] = useState<VADState>('idle');
  const [confidence, setConfidence] = useState(0);
  
  // 🎤 Estados de Recording integrados
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timeoutsRef = useRef<{ start?: NodeJS.Timeout; end?: NodeJS.Timeout }>({});
  
  // Recording refs integrados
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  
  // Buffer para análisis avanzado
  const bufferRef = useRef<VADBuffer>({
    samples: [],
    timestamps: [],
    confidence: [],
    maxSize: 50
  });

  // Estado interno para tracking
  const stateRef = useRef({
    speechStartTime: 0,
    lastVoiceTime: 0,
    isSpeaking: false,
    consecutiveVoiceFrames: 0,
    consecutiveSilenceFrames: 0,
  });

  // Análisis avanzado de frecuencias de voz
  const analyzeVoiceFrequencies = useCallback((dataArray: Uint8Array, sampleRate: number): number => {
    const fftSize = dataArray.length;
    const binSize = sampleRate / (2 * fftSize);
    
    let voiceEnergy = 0;
    let totalEnergy = 0;
    
    // Analizar solo frecuencias de voz humana (65Hz - 4000Hz)
    const minBin = Math.floor(VAD_CONFIG.voiceFreqMin / binSize);
    const maxBin = Math.floor(VAD_CONFIG.voiceFreqMax / binSize);
    
    for (let i = 0; i < fftSize; i++) {
      const magnitude = dataArray[i];
      totalEnergy += magnitude;
      
      if (i >= minBin && i <= maxBin) {
        voiceEnergy += magnitude;
      }
    }
    
    // Retornar ratio de energía de voz vs total
    return totalEnergy > 0 ? (voiceEnergy / totalEnergy) : 0;
  }, []);

  // Cálculo de RMS con filtros anti-ruido
  const calculateRMS = useCallback((dataArray: Uint8Array): number => {
    let sum = 0;
    let validSamples = 0;
    
    for (let i = 0; i < dataArray.length; i++) {
      const sample = dataArray[i];
      
      // Filtro básico anti-ruido
      if (sample > 10) { // Ignorar ruido muy bajo
        sum += sample * sample;
        validSamples++;
      }
    }
    
    return validSamples > 0 ? Math.sqrt(sum / validSamples) : 0;
  }, []);

  // 🎤 FUNCIONES DE RECORDING INTEGRADAS
  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      if (isRecording || !streamRef.current) {
        console.log('🎤 Recording already active or no stream available');
        return false;
      }

      const hasPermission = await AudioUtils.checkMicrophonePermission();
      if (!hasPermission) {
        console.error('🎤 Microphone permission denied');
        return false;
      }

      console.log('🎤 🔴 Starting recording with shared VAD stream');
      
      const recorder = await AudioUtils.startRecording(streamRef.current);
      if (!recorder) {
        console.error('🎤 Failed to create MediaRecorder');
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

      // Timeout de seguridad (30 segundos)
      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          console.warn('⚠️ Recording timeout reached, stopping...');
          stopRecording();
        }
      }, 30000);

      return true;
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      return false;
    }
  }, [isRecording]);

  const stopRecording = useCallback(async (): Promise<AudioRecordingResult | null> => {
    if (!isRecording || !mediaRecorderRef.current) {
      console.log('🎤 No active recording to stop');
      return null;
    }

    try {
      console.log('🎤 ⏹️ Stopping recording');
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
        console.error('🎤 Failed to get audio blob');
        return null;
      }

      // Validate recording quality
      if (audioBlob.size < 1000) {
        console.warn('🎤 Recording too short');
        return null;
      }

      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);

      console.log('🎤 ✅ Recording completed:', {
        size: audioBlob.size,
        duration: duration,
        type: audioBlob.type
      });

      const result: AudioRecordingResult = {
        audioBlob,
        duration,
      };

      mediaRecorderRef.current = null;
      setRecordingDuration(0);

      // Process audio through callback
      await onAudioProcessed(audioBlob);

      return result;
    } catch (error) {
      console.error('❌ Failed to stop recording:', error);
      return null;
    }
  }, [isRecording, onAudioProcessed]);

  const cancelRecording = useCallback(async () => {
    if (!isRecording) return;

    console.log('🎤 🚫 Cancelling recording');
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

  const shouldActivateRecording = useCallback(() => {
    return (
      state.isCallActive &&
      !state.isMuted &&
      state.phase === 'listening' &&
      state.avatarConnected &&
      !isRecording
    );
  }, [state.isCallActive, state.isMuted, state.phase, state.avatarConnected, isRecording]);

  // Análisis inteligente de actividad de voz
  const analyzeVoiceActivity = useCallback(() => {
    if (!analyserRef.current || !isListening || initializationStateRef.current !== 'active') {
      return;
    }

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Cálculos de análisis
    const rms = calculateRMS(dataArray);
    const voiceRatio = analyzeVoiceFrequencies(dataArray, VAD_CONFIG.sampleRate);
    const currentTime = Date.now();
    
    // Confianza basada en múltiples factores
    const rmsConfidence = Math.min(rms / VAD_CONFIG.voiceThreshold, 1);
    const freqConfidence = voiceRatio;
    const overallConfidence = (rmsConfidence * 0.7 + freqConfidence * 0.3) * (75 / 100); // sensitivity 75
    
    setConfidence(overallConfidence);
    
    // Actualizar buffer
    const buffer = bufferRef.current;
    buffer.samples.push(rms);
    buffer.timestamps.push(currentTime);
    buffer.confidence.push(overallConfidence);
    
    if (buffer.samples.length > buffer.maxSize) {
      buffer.samples.shift();
      buffer.timestamps.shift();
      buffer.confidence.shift();
    }

    // Detección de voz más sensible para captar voz normal
    const isVoiceDetected = rms > VAD_CONFIG.voiceThreshold && voiceRatio > 0.05;
    const isSilence = rms < VAD_CONFIG.silenceThreshold;
    const isAmbientNoise = rms > VAD_CONFIG.silenceThreshold && rms < VAD_CONFIG.voiceThreshold;
    
    // 🔥 LOGS MEJORADOS: Cada 10 frames (más frecuente) + métricas útiles
    const frameCount = Math.floor(currentTime / 100); // Cada ~100ms
    if (frameCount % 10 === 0) {
      console.log('🎤 VAD Debug:', {
        rms: rms.toFixed(2),
        voiceRatio: voiceRatio.toFixed(3),
        confidence: overallConfidence.toFixed(3),
        isVoiceDetected,
        isSilence,
        voiceFrames: internalState.consecutiveVoiceFrames,
        silenceFrames: internalState.consecutiveSilenceFrames,
        vadState,
        recorderStatus: isRecording ? 'recording' : 'idle',
        streamActive: streamRef.current ? 'active' : 'inactive'
      });
    }
    
    const internalState = stateRef.current;
    
    if (isVoiceDetected) {
      internalState.lastVoiceTime = currentTime;
      internalState.consecutiveVoiceFrames++;
      internalState.consecutiveSilenceFrames = 0;
      
      // Detectar primera sílaba inmediatamente - más agresivo
      if (!internalState.isSpeaking && internalState.consecutiveVoiceFrames >= 1) {
        if (timeoutsRef.current.start) {
          clearTimeout(timeoutsRef.current.start);
        }
        
        timeoutsRef.current.start = setTimeout(async () => {
          if (!internalState.isSpeaking && internalState.consecutiveVoiceFrames >= 1) {
            console.log('🎤 ✅ VAD: Speech detected - starting recording');
            console.log('🎤 📊 VAD Metrics:', {
              rms: rms.toFixed(2),
              voiceRatio: voiceRatio.toFixed(3),
              confidence: overallConfidence.toFixed(3),
              consecutiveFrames: internalState.consecutiveVoiceFrames
            });
            internalState.isSpeaking = true;
            internalState.speechStartTime = currentTime;
            setVadState('speaking');
            
            if (shouldActivateRecording()) {
              const recordingStarted = await startRecording();
              console.log('🎤 🔴 Recording start result:', recordingStarted);
            } else {
              console.log('🎤 ⚠️ Recording not activated:', {
                isCallActive: state.isCallActive,
                isMuted: state.isMuted,
                phase: state.phase,
                avatarConnected: state.avatarConnected,
                recorderBusy: isRecording
              });
            }
          }
        }, VAD_CONFIG.speechStartDelay);
      }
      
    } else if (isSilence || isAmbientNoise) {
      internalState.consecutiveSilenceFrames++;
      
      // Solo reducir frames de voz si hay silencio real
      if (isSilence) {
        internalState.consecutiveVoiceFrames = Math.max(0, internalState.consecutiveVoiceFrames - 1);
      }
      
      // Confirmar final de habla con más paciencia
      if (internalState.isSpeaking && internalState.consecutiveSilenceFrames >= 8) {
        const silenceDuration = currentTime - internalState.lastVoiceTime;
        const speechDuration = currentTime - internalState.speechStartTime;
        
        if (silenceDuration > VAD_CONFIG.speechEndDelay && speechDuration > VAD_CONFIG.minimumSpeechDuration) {
          if (timeoutsRef.current.end) {
            clearTimeout(timeoutsRef.current.end);
          }
          
          timeoutsRef.current.end = setTimeout(async () => {
            if (internalState.isSpeaking) {
              const finalSpeechDuration = currentTime - internalState.speechStartTime;
              console.log('🎤 🛑 VAD: Speech ended - stopping recording');
              console.log('🎤 📊 Final metrics:', {
                speechDuration: `${finalSpeechDuration}ms`,
                silenceDuration: `${silenceDuration}ms`,
                finalRMS: rms.toFixed(2),
                consecutiveSilenceFrames: internalState.consecutiveSilenceFrames
              });
              internalState.isSpeaking = false;
              setVadState('ending');
              
              if (isRecording) {
                const stopResult = await stopRecording();
                console.log('🎤 ⏹️ Recording stop result:', stopResult ? 'success' : 'failed');
              } else {
                console.log('🎤 ⚠️ Recorder was not recording when VAD ended');
              }
              
              // Cooldown optimizado según guía (200ms en lugar de 1000ms)
              setTimeout(() => {
                if (isListening && initializationStateRef.current === 'active') {
                  setVadState('cooldown');
                  setTimeout(() => {
                    if (isListening && initializationStateRef.current === 'active') {
                      setVadState('detecting');
                      console.log('🎤 VAD ready for new detection after cooldown');
                    }
                  }, VAD_CONFIG.cooldownDelay);
                }
              }, 200);
            }
          }, 50);
        }
      }
    }

    // Continuar análisis si está escuchando y el contexto es válido
    if (isListening && analyserRef.current && audioContextRef.current?.state === 'running' && initializationStateRef.current === 'active') {
      animationFrameRef.current = requestAnimationFrame(analyzeVoiceActivity);
    }
  }, [
    calculateRMS,
    analyzeVoiceFrequencies,
    isListening,
    shouldActivateRecording,
    startRecording,
    stopRecording,
    isRecording,
    state
  ]);

  const startListening = useCallback(async () => {
    // 🔥 CONTROL SINGLETON MEJORADO
    if (initializationStateRef.current !== 'idle') {
      console.log('🎤 VAD initialization already in progress or active:', initializationStateRef.current);
      return;
    }

    initializationStateRef.current = 'initializing';

    try {
      console.log('🎤 Starting unified VAD with integrated recording...');
      
      // Verificar que no hay streams previos activos
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Configuración de audio optimizada para voz
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: VAD_CONFIG.sampleRate,
          channelCount: 1,
        }
      });

      console.log('🎤 Audio stream obtained for unified VAD');
      
      // Verificar que el stream es válido y tiene tracks activos
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0 || audioTracks[0].readyState !== 'live') {
        throw new Error('Invalid audio stream - no active audio tracks');
      }
      
      streamRef.current = stream;
      
      // Crear contexto de audio con configuración optimizada
      audioContextRef.current = new AudioContext({
        sampleRate: VAD_CONFIG.sampleRate,
      });
      
      // Crear y configurar analizador
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = VAD_CONFIG.fftSize;
      analyserRef.current.smoothingTimeConstant = VAD_CONFIG.smoothingTimeConstant;
      analyserRef.current.minDecibels = VAD_CONFIG.minDecibels;
      analyserRef.current.maxDecibels = VAD_CONFIG.maxDecibels;

      // Conectar stream al analizador
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      // Resetear estado
      stateRef.current = {
        speechStartTime: 0,
        lastVoiceTime: 0,
        isSpeaking: false,
        consecutiveVoiceFrames: 0,
        consecutiveSilenceFrames: 0,
      };
      
      bufferRef.current = {
        samples: [],
        timestamps: [],
        confidence: [],
        maxSize: 50
      };

      vadInstanceRef.current = true;
      initializationStateRef.current = 'active';
      setIsListening(true);
      setVadState('detecting');
      
      // Iniciar análisis después de un breve delay
      setTimeout(() => {
        if (initializationStateRef.current === 'active') {
          analyzeVoiceActivity();
          console.log('🎤 ✅ Unified VAD analysis loop started');
        }
      }, 100);
      
      console.log('🎤 ✅ Unified VAD initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to start unified VAD:', error);
      initializationStateRef.current = 'idle';
      throw error;
    }
  }, [analyzeVoiceActivity]);

  const stopListening = useCallback(() => {
    if (initializationStateRef.current === 'stopping' || initializationStateRef.current === 'idle') {
      return;
    }

    initializationStateRef.current = 'stopping';
    console.log('🛑 Stopping unified VAD...');
    
    // Limpiar timeouts
    Object.values(timeoutsRef.current).forEach(timeout => {
      if (timeout) clearTimeout(timeout);
    });
    timeoutsRef.current = {};
    
    // Parar animación
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Cancel any active recording
    if (isRecording) {
      cancelRecording();
    }
    
    // Limpiar recording timeouts
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    
    // Cerrar stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Cerrar contexto de audio
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    vadInstanceRef.current = false;
    initializationStateRef.current = 'idle';
    
    setIsListening(false);
    setVadState('idle');
    setConfidence(0);
    setIsRecording(false);
    setRecordingDuration(0);
    
    // Resetear estado
    stateRef.current = {
      speechStartTime: 0,
      lastVoiceTime: 0,
      isSpeaking: false,
      consecutiveVoiceFrames: 0,
      consecutiveSilenceFrames: 0,
    };
    
    console.log('🛑 ✅ Unified VAD stopped successfully');
  }, [isRecording, cancelRecording]);

  // 🔥 CONTROL PRINCIPAL SIMPLIFICADO - Evita loops
  useEffect(() => {
    const shouldVADBeActive = (
      state.isCallActive &&
      !state.isMuted &&
      state.phase === 'listening' &&
      state.avatarConnected
    );

    // 🔥 LOGS REDUCIDOS - Solo cada 50 checks para evitar spam
    const logFrequency = 50;
    const shouldLog = Math.floor(Date.now() / 100) % logFrequency === 0;
    
    if (shouldLog) {
      console.log('🎤 VAD activation check:', {
        shouldVADBeActive,
        isCallActive: state.isCallActive,
        isMuted: state.isMuted,
        phase: state.phase,
        avatarConnected: state.avatarConnected,
        currentlyListening: isListening,
        initState: initializationStateRef.current,
        vadInstance: vadInstanceRef.current
      });
    }

    if (shouldVADBeActive && !vadInstanceRef.current && initializationStateRef.current === 'idle') {
      console.log('🎤 🟢 Starting unified VAD');
      startListening();
    } else if (!shouldVADBeActive && vadInstanceRef.current && initializationStateRef.current === 'active') {
      console.log('🎤 🔴 Stopping unified VAD');
      stopListening();
    }
  }, [state.isCallActive, state.isMuted, state.phase, state.avatarConnected, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vadInstanceRef.current) {
        stopListening();
      }
    };
  }, [stopListening]);

  return {
    vad: {
      isListening,
      vadState,
      confidence,
      startListening,
      stopListening,
      isVoiceActive: stateRef.current.isSpeaking,
    },
    recorder: {
      isRecording,
      recordingDuration,
      startRecording,
      stopRecording,
      cancelRecording,
    },
    isVADActive: isListening,
  };
};
