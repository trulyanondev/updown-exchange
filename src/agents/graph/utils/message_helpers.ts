import { BaseMessage } from "@langchain/core/messages";

/**
 * Converts LangChain BaseMessage to OpenAI API format
 * Maps message types robustly with fallbacks and ensures proper typing
 */
export function mapMessageToOpenAI(message: BaseMessage): { role: 'system' | 'user' | 'assistant' | 'tool', content: string } {
  const messageType = message.getType();
  
  let role: 'system' | 'user' | 'assistant' | 'tool';
  
  switch (messageType) {
    case 'human':
      role = 'user' as const;
      break;
    case 'ai':
      role = 'assistant' as const;
      break;
    case 'system':
      role = 'system' as const;
      break;
    case 'tool':
      role = 'tool' as const;
      break;
    default:
      // Fallback: treat unknown message types as user messages
      console.warn(`Unknown message type: ${messageType}, defaulting to 'user'`);
      role = 'user' as const;
      break;
  }
  
  // Ensure content is always a string
  const content = typeof message.content === 'string' 
    ? message.content 
    : JSON.stringify(message.content);
  
  return {
    role,
    content
  };
}

/**
 * Converts an array of LangChain messages to OpenAI API format
 * Uses 'any' type to work around OpenAI library type compatibility issues
 */
export function mapMessagesToOpenAI(messages: BaseMessage[]): any[] {
  return messages.map(mapMessageToOpenAI).filter(message => message.role !== 'tool');
}