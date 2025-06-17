
import { MicVAD } from '@ricky0123/vad-web';

let instance: MicVAD | null = null;
let isInitializing = false;

// Callbacks for speech events
const speechStartCallbacks: (() => void)[] = [];
const speechEndCallbacks: ((audio: Float32Array) => void)[] = [];
const vadReadyCallbacks: (() => void)[] = [];

export interface MicVADConfig {
  baseUrl?: string;
  onnxWASMBasePath?: string;
  workletPath?: string;
  modelURL?: string;
  ortConfig?: any;
}

export class MicVADSingleton {
  private static defaultConfig: MicVADConfig = {
    baseUrl: '/vad',
    workletPath: '/vad/vad.worklet.bundle.min.js',
    modelURL: '/vad/silero_vad_v5.onnx',
    onnxWASMBasePath: '/vad',
    ortConfig: {
      wasmPaths: '/vad/'
    }
  };

  static async getInstance(config?: Partial<MicVADConfig>): Promise<MicVAD> {
    if (instance) {
      return instance;
    }

    if (isInitializing) {
      // Wait for initialization to complete
      return new Promise((resolve) => {
        const checkInstance = () => {
          if (instance) {
            resolve(instance);
          } else {
            setTimeout(checkInstance, 100);
          }
        };
        checkInstance();
      });
    }

    isInitializing = true;
    console.log('🎤 Initializing MicVAD singleton...');

    try {
      const finalConfig = { ...this.defaultConfig, ...config };
      
      instance = await MicVAD.new({
        workletURL: finalConfig.workletPath,
        modelURL: finalConfig.modelURL,
        ortConfig: finalConfig.ortConfig,
        
        onSpeechStart: () => {
          console.log('🎤 MicVAD: Speech started');
          speechStartCallbacks.forEach(cb => cb());
        },
        
        onSpeechEnd: (audio: Float32Array) => {
          console.log('🎤 MicVAD: Speech ended, audio length:', audio.length);
          speechEndCallbacks.forEach(cb => cb(audio));
        },
        
        onVADMisfire: () => {
          console.log('🎤 MicVAD: VAD misfire detected');
        }
      });

      console.log('✅ MicVAD singleton initialized successfully');
      vadReadyCallbacks.forEach(cb => cb());
      return instance;

    } catch (error) {
      console.error('❌ Failed to initialize MicVAD:', error);
      isInitializing = false;
      throw error;
    } finally {
      isInitializing = false;
    }
  }

  static async start(): Promise<void> {
    if (!instance) {
      throw new Error('MicVAD not initialized. Call getInstance() first.');
    }
    
    console.log('🎤 Starting MicVAD listening...');
    await instance.start();
  }

  static async pause(): Promise<void> {
    if (!instance) return;
    
    console.log('🎤 Pausing MicVAD...');
    await instance.pause();
  }

  static async destroy(): Promise<void> {
    if (!instance) return;
    
    console.log('🛑 Destroying MicVAD singleton...');
    await instance.destroy();
    instance = null;
    isInitializing = false;
    
    // Clear all callbacks
    speechStartCallbacks.length = 0;
    speechEndCallbacks.length = 0;
    vadReadyCallbacks.length = 0;
  }

  static isReady(): boolean {
    return instance !== null && !isInitializing;
  }

  static isListening(): boolean {
    return instance ? instance.listening : false;
  }

  // Event subscription methods
  static onSpeechStart(callback: () => void): () => void {
    speechStartCallbacks.push(callback);
    return () => {
      const index = speechStartCallbacks.indexOf(callback);
      if (index > -1) speechStartCallbacks.splice(index, 1);
    };
  }

  static onSpeechEnd(callback: (audio: Float32Array) => void): () => void {
    speechEndCallbacks.push(callback);
    return () => {
      const index = speechEndCallbacks.indexOf(callback);
      if (index > -1) speechEndCallbacks.splice(index, 1);
    };
  }

  static onReady(callback: () => void): () => void {
    if (instance) {
      callback(); // Call immediately if already ready
      return () => {};
    }
    
    vadReadyCallbacks.push(callback);
    return () => {
      const index = vadReadyCallbacks.indexOf(callback);
      if (index > -1) vadReadyCallbacks.splice(index, 1);
    };
  }

  // Utility method to convert Float32Array to WAV Blob
  static audioToWavBlob(audioData: Float32Array, sampleRate: number = 16000): Blob {
    const buffer = new ArrayBuffer(44 + audioData.length * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + audioData.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, audioData.length * 2, true);

    // Convert audio data
    let offset = 44;
    for (let i = 0; i < audioData.length; i++) {
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }
}

export default MicVADSingleton;
