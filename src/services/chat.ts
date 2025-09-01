export interface Message {
  id: string;
  user_id: string;
  thread_id: string;
  wallet_id: string | null;
  role: string;
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
  role: string;
  content: string;
  index: number;
  created_at: string;
  wallet_address: string | null;
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
    messages: Message[], 
    privyToken: string
  ): Promise<void> {
    let url = "https://nefhbvdkknucokyoudxc.supabase.co/functions/v1/chat_messages"
    const response = await fetch(`${url}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${privyToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messages)
    });

    if (!response.ok) {
      throw new Error(`Failed to save messages: ${response.status} ${response.statusText}`);
    }
  }
}

export default ChatService;