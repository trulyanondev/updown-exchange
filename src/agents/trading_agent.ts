import { xai } from '@ai-sdk/xai';
import { generateObject, generateText } from 'ai';
import { executeAgentTool, getToolDefinitions } from '../agent_tools/trading_tools.js';

export interface AgentRequest {
  prompt: string;
  walletId: string;
}

export interface AgentResponse {
  success: boolean;
  message: string;
  actions?: any[];
  error?: string;
}

/**
 * Trading Agent powered by Grok-4 that interprets prompts and executes trading actions
 */
class TradingAgent {
  private model;
  private availableTools;

  constructor() {
    this.model = xai('grok-2');
    this.availableTools = getToolDefinitions();
  }

  /**
   * Process a trading prompt using Grok-4 and execute required actions
   */
  async processPrompt(request: AgentRequest): Promise<AgentResponse> {
    try {
      const { prompt, walletId } = request;
      
      // Use Grok to analyze the prompt and plan trading actions
      const planResponse = await generateText({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are a trading agent that helps users execute trading actions on Hyperliquid exchange.

Available tools:
${JSON.stringify(this.availableTools, null, 2)}

Guidelines:
- Asset IDs: 0 = BTC, 1 = ETH
- Leverage must be 1-50
- Prices should be strings (e.g. "50000.5")
- Sizes should be strings (e.g. "0.1")
- Order types: {"limit": {}} or {"market": {}}
- Always include the walletId: ${walletId}

Analyze the user's request and respond with a JSON object in this exact format:
{
  "actions": [
    {
      "tool": "update_leverage" or "create_order",
      "params": {
        "walletId": "${walletId}",
        "assetId": 0 or 1,
        "leverage": number (for update_leverage),
        "isBuy": boolean (for create_order),
        "price": "string" (for create_order),
        "size": "string" (for create_order),
        "orderType": {"limit": {"tif": "Ioc"}} for limit and { "trigger": { "isMarket": true, "triggerPx": "0", "tpsl": "tp" }} for market (for create_order)
      },
      "reasoning": "explanation of this action"
    }
  ],
  "summary": "brief summary of what will be done"
}

Only respond with valid JSON, no other text.`
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      // Parse the JSON response
      let plan;
      try {
        plan = JSON.parse(planResponse.text);
      } catch (parseError) {
        throw new Error(`Failed to parse AI response as JSON: ${parseError}`);
      }

      if (!plan.actions || plan.actions.length === 0) {
        return {
          success: false,
          message: "I couldn't determine any trading actions from your request. Please be more specific about what you'd like to do.",
          error: "No actions planned"
        };
      }

      // Execute the planned actions
      const results = [];
      for (const action of plan.actions) {
        try {
          // Add walletId to params if not present
          const params = { ...action.params, walletId };
          
          const result = await executeAgentTool(action.tool, params);
          results.push({
            tool: action.tool,
            success: true,
            result,
            reasoning: action.reasoning,
            params
          });
        } catch (error) {
          results.push({
            tool: action.tool,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            reasoning: action.reasoning,
            params: action.params
          });
        }
      }

      // Generate a final response using Grok
      const responseText = await generateText({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a trading assistant. Summarize the results of trading actions in a friendly, concise way.'
          },
          {
            role: 'user',
            content: `Original request: ${prompt}

Plan: ${plan.summary}

Results: ${JSON.stringify(results, null, 2)}

Please provide a clear summary of what was accomplished.`
          }
        ]
      });

      const allSucceeded = results.every(r => r.success);
      
      return {
        success: allSucceeded,
        message: responseText.text,
        actions: results
      };

    } catch (error) {
      console.error('Trading agent error:', error);
      
      return {
        success: false,
        message: "I encountered an error while processing your trading request. Please try again or rephrase your request.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get information about trading capabilities
   */
  async getCapabilities(): Promise<string> {
    const response = await generateText({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: `You are a trading assistant. Explain what trading capabilities you have based on these tools:

${JSON.stringify(this.availableTools, null, 2)}

Keep it concise and user-friendly. Mention that you support BTC (asset 0) and ETH (asset 1).`
        },
        {
          role: 'user',
          content: 'What can you help me with for trading?'
        }
      ]
    });

    return response.text;
  }
}

export default TradingAgent;