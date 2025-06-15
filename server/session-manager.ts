// HeyGen Session Manager to handle concurrent limits and session lifecycle
import { HeyGenService } from './heygen-service.js';

interface ActiveSession {
  sessionId: string;
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
}

export class HeyGenSessionManager {
  private activeSessions: Map<string, ActiveSession> = new Map();
  private heygenService: HeyGenService;
  private maxConcurrentSessions = 1; // Free tier limit
  private sessionTimeout = 10 * 60 * 1000; // 10 minutes

  constructor(heygenService: HeyGenService) {
    this.heygenService = heygenService;
    
    // Cleanup inactive sessions every 5 minutes
    setInterval(() => {
      this.cleanupInactiveSessions();
    }, 5 * 60 * 1000);
  }

  async createSession(avatarId?: string): Promise<any> {
    // Check if we can create a new session
    await this.ensureCapacity();
    
    try {
      const sessionData = await this.heygenService.createStreamingSession(avatarId);
      
      // Track the session
      this.activeSessions.set(sessionData.sessionId, {
        sessionId: sessionData.sessionId,
        createdAt: new Date(),
        lastActivity: new Date(),
        isActive: true
      });

      return sessionData;
    } catch (error) {
      console.error('Failed to create HeyGen session:', error);
      throw error;
    }
  }

  async startSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    await this.heygenService.startSession(sessionId);
    this.updateActivity(sessionId);
  }

  async closeSession(sessionId: string): Promise<void> {
    try {
      await this.heygenService.closeSession(sessionId);
    } catch (error) {
      console.warn('Error closing HeyGen session:', error);
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }

  updateActivity(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  private async ensureCapacity(): Promise<void> {
    const activeSessions = Array.from(this.activeSessions.values())
      .filter(session => session.isActive);

    if (activeSessions.length >= this.maxConcurrentSessions) {
      // Close the oldest session
      const oldestSession = activeSessions
        .sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime())[0];
      
      if (oldestSession) {
        console.log(`Closing oldest session: ${oldestSession.sessionId}`);
        await this.closeSession(oldestSession.sessionId);
      }
    }
  }

  private cleanupInactiveSessions(): void {
    const now = new Date();
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      const timeSinceActivity = now.getTime() - session.lastActivity.getTime();
      
      if (timeSinceActivity > this.sessionTimeout) {
        console.log(`Cleaning up inactive session: ${sessionId}`);
        this.closeSession(sessionId);
      }
    }
  }

  getActiveSessionCount(): number {
    return Array.from(this.activeSessions.values())
      .filter(session => session.isActive).length;
  }
}