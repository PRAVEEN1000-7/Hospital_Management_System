/**
 * HMS AI Chat — API Service
 * ===========================
 * Handles all communication with the chat backend.
 * Uses the shared axios instance (auto-attaches JWT token).
 *
 * PLUG-AND-PLAY: Self-contained, no side effects on other services.
 */

import api from '../../services/api';
import type { ChatRequest, ChatResponse, RoleSummary } from './chatTypes';

const chatService = {
  /**
   * Send a message to the AI assistant.
   * The backend determines the response based on user role (from JWT).
   */
  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    const response = await api.post<ChatResponse>('/chat/ask', request);
    return response.data;
  },

  /**
   * Get the current user's role summary (what they can/can't do).
   */
  async getRoleSummary(): Promise<RoleSummary> {
    const response = await api.get<RoleSummary>('/chat/role-summary');
    return response.data;
  },
};

export default chatService;
