import { conversations, messages, type Conversation, type Message, type InsertConversation, type InsertMessage } from "@shared/schema";

export interface IStorage {
  // Conversations
  getConversation(sessionId: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  
  // Messages
  getMessages(conversationId: string): Promise<Message[]>;
  addMessage(message: InsertMessage): Promise<Message>;
  getRecentMessages(conversationId: string, limit?: number): Promise<Message[]>;
}

export class MemStorage implements IStorage {
  private conversations: Map<string, Conversation>;
  private messages: Map<string, Message[]>;
  private currentConversationId: number;
  private currentMessageId: number;

  constructor() {
    this.conversations = new Map();
    this.messages = new Map();
    this.currentConversationId = 1;
    this.currentMessageId = 1;
  }

  async getConversation(sessionId: string): Promise<Conversation | undefined> {
    return Array.from(this.conversations.values()).find(
      (conv) => conv.sessionId === sessionId
    );
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = this.currentConversationId++;
    const conversation: Conversation = {
      ...insertConversation,
      id,
      createdAt: new Date(),
    };
    this.conversations.set(insertConversation.sessionId, conversation);
    this.messages.set(insertConversation.sessionId, []);
    return conversation;
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    return this.messages.get(conversationId) || [];
  }

  async addMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = this.currentMessageId++;
    const message: Message = {
      ...insertMessage,
      id,
      timestamp: new Date(),
    };
    
    const conversationMessages = this.messages.get(insertMessage.conversationId) || [];
    conversationMessages.push(message);
    this.messages.set(insertMessage.conversationId, conversationMessages);
    
    return message;
  }

  async getRecentMessages(conversationId: string, limit: number = 10): Promise<Message[]> {
    const messages = this.messages.get(conversationId) || [];
    return messages.slice(-limit);
  }
}

export const storage = new MemStorage();
