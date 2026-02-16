/**
 * HMS AI Chat Widget — Floating Bottom-Right Chatbot
 * ====================================================
 * Features:
 * - Floating FAB button (bottom-right corner)
 * - Expandable chat panel with message history
 * - Voice input via Web Speech API (free, built into browser)
 * - Role-aware responses (from AuthContext)
 * - Markdown-lite rendering (bold, bullets, code)
 * - Typing indicator while AI is thinking
 * - Conversation history sent for context
 *
 * PLUG-AND-PLAY:
 * - Add: <AIChatWidget /> anywhere inside <AuthProvider>
 * - Remove: Delete this file + chatService.ts + chatTypes.ts
 *   and remove the <AIChatWidget /> line from App.tsx
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import chatService from './chatService';
import type { ChatMessage } from './chatTypes';

// ─── Speech Recognition Type ─────────────────
interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

// ─── Markdown-lite renderer ──────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    let processed: React.ReactNode;

    // Headers
    if (line.startsWith('### ')) {
      processed = <h4 key={i} className="font-bold text-sm mt-2 mb-1 text-slate-800">{renderInline(line.slice(4))}</h4>;
    } else if (line.startsWith('## ')) {
      processed = <h3 key={i} className="font-bold text-base mt-2 mb-1 text-slate-800">{renderInline(line.slice(3))}</h3>;
    }
    // Bullet points
    else if (line.match(/^[\-•]\s/)) {
      processed = <div key={i} className="flex gap-1.5 ml-1 my-0.5"><span className="text-primary mt-0.5 shrink-0">•</span><span>{renderInline(line.slice(2))}</span></div>;
    }
    // Numbered lists
    else if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\./)?.[1];
      const content = line.replace(/^\d+\.\s/, '');
      processed = <div key={i} className="flex gap-1.5 ml-1 my-0.5"><span className="text-primary font-semibold shrink-0">{num}.</span><span>{renderInline(content)}</span></div>;
    }
    // Empty lines
    else if (line.trim() === '') {
      processed = <div key={i} className="h-1.5" />;
    }
    // Normal text
    else {
      processed = <p key={i} className="my-0.5">{renderInline(line)}</p>;
    }

    elements.push(processed);
  });

  return elements;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match **bold**, *italic*, `code`, 📍, ✅, 🚫, 💡, 👋, 😊
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-slate-800">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={match.index} className="italic text-slate-600">{match[3]}</em>);
    } else if (match[4]) {
      parts.push(<code key={match.index} className="bg-blue-50 text-primary text-xs px-1.5 py-0.5 rounded font-mono">{match[4]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

// ─── Typing animation dots ──────────────────
const TypingIndicator: React.FC = () => (
  <div className="flex items-center gap-1 px-4 py-3">
    <div className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-primary/50"
          style={{
            animation: 'chat-bounce 1.4s infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
    <span className="text-xs text-slate-400 ml-2">HMS AI is thinking...</span>
  </div>
);

// ─── Quick suggestion chips ──────────────────
const QUICK_SUGGESTIONS = [
  'What can I do?',
  'How to register a patient?',
  'How to change my password?',
  'Who can manage users?',
];

// ─── Main Widget Component ───────────────────
const AIChatWidget: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Don't render if not authenticated
  if (!isAuthenticated || !user) return null;

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Add welcome message on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const roleName = user.role.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `👋 Hi **${user.full_name || user.username}**! I'm the HMS AI Assistant.\n\nYou're logged in as **${roleName}**. I can help you with:\n\n• Understanding your permissions\n• Step-by-step guides for any feature\n• Finding where things are\n• Troubleshooting issues\n\nJust type a question or tap a suggestion below!`,
          timestamp: new Date(),
          source: 'rules',
        },
      ]);
    }
  }, [isOpen, messages.length, user]);

  // ── Send message ────────────────────────
  const sendMessage = async (text?: string) => {
    const messageText = (text || inputValue).trim();
    if (!messageText || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Build conversation history (skip welcome + loading messages)
      const history = messages
        .filter((m) => m.id !== 'welcome' && !m.isLoading)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const response = await chatService.sendMessage({
        message: messageText,
        conversation_history: history,
      });

      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        source: response.source,
      };

      setMessages((prev) => [...prev, aiMessage]);

      if (!isOpen) setHasUnread(true);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const errMessage: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ Sorry, I couldn't process that. ${errorMsg.includes('401') ? 'Your session may have expired — try logging in again.' : 'Please try again.'}`,
        timestamp: new Date(),
        source: 'fallback',
      };
      setMessages((prev) => [...prev, errMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Voice input ─────────────────────────
  const toggleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(transcript);
      setIsListening(false);
      // Auto-send after voice input
      setTimeout(() => {
        sendMessage(transcript);
      }, 300);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // ── Handle keyboard ────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Toggle open/close ──────────────────
  const toggleChat = () => {
    setIsOpen((prev) => !prev);
    if (!isOpen) setHasUnread(false);
  };

  // ── Clear chat ─────────────────────────
  const clearChat = () => {
    setMessages([]);
  };

  return (
    <>
      {/* Keyframe animation for typing dots */}
      <style>{`
        @keyframes chat-bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
        @keyframes chat-slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes chat-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .chat-message-enter {
          animation: chat-fade-in 0.3s ease-out;
        }
      `}</style>

      {/* ── Chat Panel ─────────────────────── */}
      {isOpen && (
        <div
          className="fixed bottom-24 right-6 z-[9999] w-[400px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          style={{ animation: 'chat-slide-up 0.3s ease-out' }}
        >
          {/* ── Header ──── */}
          <div className="bg-gradient-to-r from-primary to-blue-600 px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-xl">smart_toy</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold text-sm">HMS AI Assistant</h3>
              <p className="text-blue-100 text-xs truncate">
                {user.role.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} • {user.username}
              </p>
            </div>
            <button
              onClick={clearChat}
              className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              title="Clear chat"
            >
              <span className="material-symbols-outlined text-lg">delete_sweep</span>
            </button>
            <button
              onClick={toggleChat}
              className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              title="Close"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          {/* ── Messages ──── */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar bg-slate-50/50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-message-enter flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-1 shrink-0">
                    <span className="material-symbols-outlined text-primary text-sm">smart_toy</span>
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-white rounded-br-md'
                      : 'bg-white text-slate-700 rounded-bl-md shadow-sm border border-slate-100'
                  }`}
                >
                  {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                  {msg.source && msg.role === 'assistant' && (
                    <div className="flex items-center gap-1 mt-1.5 pt-1 border-t border-slate-100">
                      <span className="material-symbols-outlined text-[10px] text-slate-300">
                        {msg.source === 'ai' || msg.source === 'ai+db' ? 'auto_awesome' : msg.source === 'instant' ? 'bolt' : 'info'}
                      </span>
                      <span className="text-[10px] text-slate-300">
                        {msg.source === 'ai+db' ? 'AI + Database' : msg.source === 'ai' ? 'AI' : msg.source === 'instant' ? 'Instant (Offline)' : 'Offline'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start chat-message-enter">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-1 shrink-0">
                  <span className="material-symbols-outlined text-primary text-sm">smart_toy</span>
                </div>
                <div className="bg-white rounded-2xl rounded-bl-md shadow-sm border border-slate-100">
                  <TypingIndicator />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Quick Suggestions ──── */}
          {messages.length <= 1 && !isLoading && (
            <div className="px-4 py-2 border-t border-slate-100 bg-white shrink-0">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => sendMessage(suggestion)}
                    className="text-xs px-3 py-1.5 rounded-full bg-blue-50 text-primary hover:bg-blue-100 transition-colors border border-blue-100 whitespace-nowrap"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Input Area ──── */}
          <div className="px-3 py-2.5 border-t border-slate-200 bg-white shrink-0">
            <div className="flex items-center gap-2">
              {/* Voice button */}
              <button
                onClick={toggleVoiceInput}
                className={`p-2 rounded-xl transition-all ${
                  isListening
                    ? 'bg-red-500 text-white shadow-lg shadow-red-200 scale-110'
                    : 'text-slate-400 hover:text-primary hover:bg-blue-50'
                }`}
                title={isListening ? 'Stop listening' : 'Voice input'}
              >
                <span className="material-symbols-outlined text-xl">
                  {isListening ? 'hearing' : 'mic'}
                </span>
              </button>

              {/* Text input */}
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? 'Listening...' : 'Ask me anything...'}
                disabled={isLoading || isListening}
                className={`flex-1 text-sm px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all ${
                  isListening
                    ? 'bg-red-50 border-red-200 placeholder-red-400'
                    : 'bg-slate-50 border-slate-200 placeholder-slate-400'
                }`}
              />

              {/* Send button */}
              <button
                onClick={() => sendMessage()}
                disabled={!inputValue.trim() || isLoading}
                className="p-2 rounded-xl bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-600 transition-all active:scale-95 shadow-sm"
                title="Send message"
              >
                <span className="material-symbols-outlined text-xl">send</span>
              </button>
            </div>

            {isListening && (
              <div className="flex items-center gap-2 mt-1.5 ml-1">
                <div className="flex gap-0.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-1 bg-red-400 rounded-full"
                      style={{
                        animation: 'chat-bounce 0.8s infinite',
                        animationDelay: `${i * 0.1}s`,
                        height: `${8 + Math.random() * 12}px`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs text-red-500">Listening... speak now</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Floating Action Button ─────────── */}
      <button
        onClick={toggleChat}
        className={`fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${
          isOpen
            ? 'bg-slate-600 hover:bg-slate-700 rotate-0'
            : 'bg-gradient-to-br from-primary to-blue-600 hover:from-blue-600 hover:to-blue-700'
        }`}
        title={isOpen ? 'Close chat' : 'Open HMS AI Assistant'}
      >
        <span className="material-symbols-outlined text-white text-2xl transition-transform duration-300">
          {isOpen ? 'close' : 'smart_toy'}
        </span>

        {/* Unread badge */}
        {hasUnread && !isOpen && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
            <span className="text-[10px] text-white font-bold">!</span>
          </span>
        )}

        {/* Pulse ring when closed */}
        {!isOpen && (
          <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" style={{ animationDuration: '3s' }} />
        )}
      </button>
    </>
  );
};

export default AIChatWidget;
