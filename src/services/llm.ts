import { xai } from '@ai-sdk/xai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { CoreMessage } from 'ai';

/**
 * Centralized LLM service using Grok Code Fast 1
 * Provides structured output generation with Zod schemas
 */
export class LLMService {
  /**
   * Generate structured output using Grok Code Fast 1
   * @param prompt - The system prompt
   * @param messages - Array of conversation messages
   * @param schema - Zod schema for structured output
   * @param schemaName - Name for the schema in the output
   * @returns Parsed structured output
   */
  static async generateStructuredOutput<T>(
    prompt: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
    schema: z.ZodSchema<T>,
    schemaName: string
  ): Promise<T> {
    try {
      // Convert messages to the correct format for AI SDK
      const formattedMessages: CoreMessage[] = [
        { role: 'system', content: prompt },
        ...messages
          .filter(msg => msg.role !== 'tool') // Filter out tool messages for now
          .map(msg => ({
            role: msg.role as 'user' | 'assistant' | 'system',
            content: msg.content
          }))
      ];

      const result = await generateObject({
        model: xai('grok-code-fast-1'),
        messages: formattedMessages,
        schema,
        schemaName
      });

      return result.object;
    } catch (error) {
      console.error('LLM Service Error:', error);
      throw new Error(`Failed to generate structured output: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate text response using Grok Code Fast 1
   * @param prompt - The system prompt
   * @param messages - Array of conversation messages
   * @returns Generated text response
   */
  static async generateText(
    prompt: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
  ): Promise<string> {
    try {
      // Convert messages to the correct format for AI SDK
      const formattedMessages: CoreMessage[] = [
        { role: 'system', content: prompt },
        ...messages
          .filter(msg => msg.role !== 'tool') // Filter out tool messages for now
          .map(msg => ({
            role: msg.role as 'user' | 'assistant' | 'system',
            content: msg.content
          }))
      ];

      const result = await generateObject({
        model: xai('grok-code-fast-1'),
        messages: formattedMessages,
        schema: z.object({
          response: z.string()
        }),
        schemaName: 'text_response'
      });

      return result.object.response;
    } catch (error) {
      console.error('LLM Service Error:', error);
      throw new Error(`Failed to generate text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default LLMService;
