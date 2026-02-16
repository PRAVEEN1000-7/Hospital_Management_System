/**
 * HMS AI Chat — Type Definitions
 * ================================
 * PLUG-AND-PLAY: Delete this file + AIChatWidget.tsx + chatService.ts
 * and remove <AIChatWidget /> from App.tsx to fully remove the AI chat.
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  source?: 'rules' | 'gemini' | 'fallback';
  isLoading?: boolean;
}

export interface ChatRequest {
  message: string;
  conversation_history: {
    role: string;
    content: string;
  }[];
}

export interface ChatResponse {
  response: string;
  source: 'rules' | 'gemini' | 'fallback';
  action_detected: string | null;
}

export interface RoleSummary {
  role: string;
  label: string;
  description: string;
  summary: string;
}
