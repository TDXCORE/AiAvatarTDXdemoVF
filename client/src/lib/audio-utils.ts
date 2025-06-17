export class AudioUtils {
  private static mediaRecorder: MediaRecorder | null = null;
  private static audioChunks: Blob[] = [];

  static async checkMicrophonePermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Microphone permission denied:', error);
      return false;
    }
  }

  static async startRecording(sharedStream?: MediaStream): Promise<MediaRecorder | null> {
    try {
      // Use shared stream from VAD if available, otherwise create new one
      let stream = sharedStream;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      }

      this.audioChunks = [];
      
      // Try different MIME types in order of preference
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        ''
      ];

      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // Use longer chunks for better stability
      this.mediaRecorder.start(1000); // Collect data every 1000ms
      return this.mediaRecorder;
    } catch (error) {
      console.error('Failed to start recording:', error);
      return null;
    }
  }

  static async stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        // Stop all tracks
        if (this.mediaRecorder?.stream) {
          this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        this.mediaRecorder = null;
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  static async convertToWav(audioBlob: Blob): Promise<Blob> {
    // Validate input blob
    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('Empty or invalid audio blob');
    }

    console.log('🎵 Converting audio blob:', {
      size: audioBlob.size,
      type: audioBlob.type
    });

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      if (arrayBuffer.byteLength === 0) {
        throw new Error('Empty audio data');
      }

      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Convert to WAV format
      const wavBuffer = this.audioBufferToWav(audioBuffer);
      const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
      
      console.log('✅ WAV conversion successful:', {
        originalSize: audioBlob.size,
        wavSize: wavBlob.size
      });
      
      await audioContext.close();
      return wavBlob;
    } catch (error) {
      console.error('❌ WAV conversion failed:', error);
      
      // If original blob is substantial size, try to use it directly
      if (audioBlob.size > 1000) {
        console.warn('🔄 Using original blob as fallback');
        return audioBlob;
      }
      
      // If blob is too small, throw error
      throw new Error(`Audio conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numberOfChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numberOfChannels * 2, true);
    
    // Convert audio data
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return arrayBuffer;
  }

  static createAudioUrl(audioBlob: Blob): string {
    return URL.createObjectURL(audioBlob);
  }

  static revokeAudioUrl(url: string): void {
    URL.revokeObjectURL(url);
  }
}
