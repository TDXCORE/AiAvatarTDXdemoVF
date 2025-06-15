import type { Express } from "express";
import { HeyGenService } from "./heygen-service.js";
import path from "path";
import fs from "fs";

export function addAvatarRoutes(app: Express, heygenService: HeyGenService) {
  
  // Create new avatar streaming session
  app.post("/api/avatar/session", async (req, res) => {
    try {
      const { avatarId } = req.body;
      const sessionData = await heygenService.createStreamingSession(avatarId);
      
      // Start the session immediately
      await heygenService.startSession(sessionData.sessionId);
      
      res.json({
        success: true,
        data: sessionData
      });
    } catch (error) {
      console.error('Avatar session creation error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to create avatar session",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Send text to avatar for speech
  app.post("/api/avatar/speak", async (req, res) => {
    try {
      const { text, sessionId } = req.body;
      
      if (!text || !sessionId) {
        return res.status(400).json({
          success: false,
          message: "Text and sessionId are required"
        });
      }

      await heygenService.sendTextToSpeech(text, sessionId);
      
      res.json({
        success: true,
        message: "Text sent to avatar"
      });
    } catch (error) {
      console.error('Avatar speak error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to send text to avatar",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Send greeting to avatar
  app.post("/api/avatar/greet", async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: "SessionId is required"
        });
      }

      await heygenService.sendGreeting(sessionId);
      
      res.json({
        success: true,
        message: "Greeting sent to avatar"
      });
    } catch (error) {
      console.error('Avatar greeting error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to send greeting",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Close avatar session
  app.post("/api/avatar/close", async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: "SessionId is required"
        });
      }

      await heygenService.closeSession(sessionId);
      
      res.json({
        success: true,
        message: "Avatar session closed"
      });
    } catch (error) {
      console.error('Avatar close error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to close avatar session",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get avatar preview (placeholder for now - would need actual preview video)
  app.get("/api/avatar/preview/:avatarId", async (req, res) => {
    try {
      const { avatarId } = req.params;
      
      // For now, return a placeholder response
      // In production, you would serve an actual preview video file
      res.json({
        success: true,
        previewUrl: `/assets/avatar-preview-${avatarId}.mp4`,
        message: "Preview URL generated"
      });
    } catch (error) {
      console.error('Avatar preview error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to get avatar preview"
      });
    }
  });

  // Get available avatars
  app.get("/api/avatar/list", async (req, res) => {
    try {
      const avatars = await heygenService.getAvatarList();
      
      res.json({
        success: true,
        avatars: avatars.map(id => ({
          id,
          name: `Avatar ${id}`,
          previewUrl: `/api/avatar/preview/${id}`
        }))
      });
    } catch (error) {
      console.error('Avatar list error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to get avatar list"
      });
    }
  });
}