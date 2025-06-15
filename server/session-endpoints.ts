import type { Express } from "express";
import { PsychologicalAgent } from "./psychological-agent.js";

// Add new endpoint for session management
export function addSessionEndpoints(app: Express, psychologicalAgent: PsychologicalAgent) {
  
  // Get session summary and state
  app.get("/api/sessions/:sessionId/summary", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const summary = psychologicalAgent.getSessionSummary(sessionId);
      const state = psychologicalAgent.getSessionState(sessionId);
      
      res.json({
        summary,
        state,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Session summary error:', error);
      res.status(500).json({ 
        message: "Failed to get session summary",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Update session phase manually (for testing)
  app.post("/api/sessions/:sessionId/phase", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { phase } = req.body;
      
      const session = psychologicalAgent.getSessionState(sessionId);
      if (session) {
        session.phase = phase;
        res.json({ success: true, newPhase: phase });
      } else {
        res.status(404).json({ message: "Session not found" });
      }
    } catch (error) {
      console.error('Session phase update error:', error);
      res.status(500).json({ message: "Failed to update session phase" });
    }
  });
}