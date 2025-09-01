import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";

export interface Message {
  id: string;
  user_id: string;
  thread_id: string;
  wallet_id: string | null;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  index: number;
  created_at: Date;
  wallet_address: string | null;
}

interface MessageApiResponse {
  id: string;
  user_id: string;
  thread_id: string;
  wallet_id: string | null;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  index: number;
  created_at: string;
  wallet_address: string | null;
}

export interface SaveMessageApiResponse {
  thread_id: string;
}

export function langchain_message(message: Message): BaseMessage {

  switch (message.role) {
    case "user":
      return new HumanMessage(message.content);
    case "assistant":
      return new AIMessage(message.content);
    case "system":
      return new SystemMessage(message.content);
    case "tool":
      return new ToolMessage({
        content: message.content,
        tool_call_id: message.id
      });
  } 
}

class ChatService {

  static async getMessages(threadId: string, privyToken: string): Promise<Message[]> {
    let url = "https://nefhbvdkknucokyoudxc.supabase.co/functions/v1/chat_messages"

    const response = await fetch(`${url}?thread_id=${threadId}`, {
      headers: {
        'Authorization': `Bearer ${privyToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch messages: ${response.status} ${response.statusText}`);
    }

    const apiMessages: MessageApiResponse[] = await response.json();
    const messages: Message[] = apiMessages.map(msg => ({
      ...msg,
      created_at: new Date(msg.created_at)
    }));
    
    return messages.sort((a, b) => a.index - b.index);
  }

  static async saveMessages(
    threadId: string | undefined, // if undefined, a new thread will be created
    messages: BaseMessage[], 
    privyToken: string
  ): Promise<SaveMessageApiResponse> {

    let url = "https://nefhbvdkknucokyoudxc.supabase.co/functions/v1/chat_messages"

    function getRole(message: BaseMessage): string {
      switch (message.getType()) {
        case 'human':
          return 'user';
        case 'ai':
          return 'assistant';
        default:
          throw new Error(`Unknown message type: ${message.getType()}`);
      }
    }

    let messagesToSave = messages.map(message => ({
      role: getRole(message),
      content: message.content,
    }));

    const response = await fetch(`${url}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${privyToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ thread_id: threadId, messages: messagesToSave })
    });

    if (!response.ok) {
      throw new Error(`Failed to save messages: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

export default ChatService;