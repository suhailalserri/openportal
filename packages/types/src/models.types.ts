export interface ModelConfig {
  id:               string;
  displayName:      string;
  displayNameAr:    string;
  badge:            string;
  provider:         "openai" | "anthropic" | "google" | "deepseek";
  tier:             "free" | "standard" | "premium";
  markupMultiplier: number;
  contextWindow:    number;
  maxOutputTokens:  number;
  supportsVision:   boolean;
  supportsStreaming: boolean;
  isAvailable:      boolean;
  creditsPerKInput:  number;  // calculated, for display
  creditsPerKOutput: number;  // calculated, for display
}

export interface ChatMessage {
  role:    "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  model:          string;
  messages:       ChatMessage[];
  conversationId: string;
  stream?:        boolean;
  temperature?:   number;
  maxTokens?:     number;
}
