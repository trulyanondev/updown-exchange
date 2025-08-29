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
            content: `You are an intelligent trading agent that helps users execute trading actions on Hyperliquid exchange.

Available tools:
${JSON.stringify(this.availableTools, null, 2)}

IMPORTANT WORKFLOW:
1. ALWAYS use get_perp_metadata first to resolve symbols to assetId and get maxLeverage
2. Use get_current_price to get market price for limit orders (add 0.1% padding for buys, subtract 0.1% for sells)
3. Validate leverage against maxLeverage from metadata
4. Then execute trading actions

Smart Guidelines:
- Use get_perp_metadata(symbol) to get assetId and maxLeverage for ANY symbol (BTC, ETH, SOL, etc.)
- Use get_current_price(symbol) for limit orders when user doesn't specify price
- Add price padding: Buy orders +0.1%, Sell orders -0.1% of current price
- Validate leverage <= maxLeverage from metadata
- Prices and sizes must be strings
- Order types: {"limit": {"tif": "Ioc"}} for limit, {"trigger": {"isMarket": true, "triggerPx": "0", "tpsl": "tp"}} for market
- Always include walletId: ${walletId}

EXAMPLE WORKFLOW for "Buy $100 worth of BTC with 10x leverage":
1. get_perp_metadata("BTC") → get assetId and maxLeverage
2. get_current_price("BTC") → get current price, add 0.1% for buy order
3. update_leverage if needed (assetId will be auto-resolved)
4. create_order with calculated values (assetId, price, size auto-resolved)

IMPORTANT: For create_order, you can use placeholder values that will be automatically resolved:
- assetId: Will be resolved from get_perp_metadata result
- price: Will be resolved from get_current_price + padding
- size: Use format like "calculated from $100 and current price" for dollar amounts

Analyze the user's request and respond with a JSON object in this exact format:
{
  "actions": [
    {
      "tool": "get_perp_metadata" | "get_current_price" | "update_leverage" | "create_order",
      "params": {
        "symbol": "string" (for get_perp_metadata, get_current_price),
        "walletId": "${walletId}" (for update_leverage, create_order),
        "assetId": number (for update_leverage, create_order - from metadata),
        "leverage": number (for update_leverage),
        "isBuy": boolean (for create_order),
        "price": "string" (for create_order - from current price + padding),
        "size": "string" (for create_order),
        "orderType": object (for create_order)
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

      // Execute the planned actions sequentially with context sharing
      const results = [];
      const actionContext: any = { walletId };
      
      // Pre-scan actions to gather context needed for price calculations
      for (const action of plan.actions) {
        if (action.tool === 'create_order' && action.params.isBuy !== undefined) {
          actionContext.isBuy = action.params.isBuy;
        }
      }
      
      for (const action of plan.actions) {
        try {
          // Smart parameter resolution with context values
          let params = { ...action.params };
          
          // For create_order actions, resolve calculated values
          if (action.tool === 'create_order') {
            // Override with context values for resolved parameters
            if (actionContext.assetId !== undefined) {
              params.assetId = actionContext.assetId;
            }
            if (actionContext.paddedPrice !== undefined) {
              params.price = actionContext.paddedPrice;
            }
            if (actionContext.walletId !== undefined) {
              params.walletId = actionContext.walletId;
            }
            
            // Calculate size if it's a placeholder and we have required context
            if (typeof params.size === 'string' && 
                params.size.includes('calculated') && 
                actionContext.currentPrice) {
              // Try to extract dollar amount from size description
              const dollarMatch = params.size.match(/\$(\d+(?:\.\d+)?)/);
              if (dollarMatch) {
                const dollarAmount = parseFloat(dollarMatch[1]);
                const calculatedSize = (dollarAmount / actionContext.currentPrice).toString();
                params.size = calculatedSize;
              }
            }
          }
          
          // For update_leverage actions, ensure assetId is resolved
          if (action.tool === 'update_leverage' && actionContext.assetId !== undefined) {
            params.assetId = actionContext.assetId;
            params.walletId = actionContext.walletId;
          }
          
          // Merge any remaining context values
          params = { ...params, ...actionContext };
          
          const result = await executeAgentTool(action.tool, params);
          
          // Store results in context for subsequent actions
          if (action.tool === 'get_perp_metadata') {
            actionContext.assetId = result.assetId;
            actionContext.maxLeverage = result.maxLeverage;
            actionContext.symbol = params.symbol;
          } else if (action.tool === 'get_current_price') {
            actionContext.currentPrice = result;
            
            // Apply padding for limit orders
            const isBuy = actionContext.isBuy;
            if (isBuy !== undefined) {
              const paddingMultiplier = isBuy ? 1.001 : 0.999; // +0.1% for buy, -0.1% for sell
              actionContext.paddedPrice = (result * paddingMultiplier).toString();
            }
          }
          
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
          
          // Stop execution on error for critical steps
          if (action.tool === 'get_perp_metadata' || action.tool === 'get_current_price') {
            break;
          }
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
          content: `You are an intelligent trading assistant. Explain what trading capabilities you have based on these tools:

${JSON.stringify(this.availableTools, null, 2)}

Key features:
- Support for ANY cryptocurrency symbol (BTC, ETH, SOL, etc.) with automatic symbol resolution
- Real-time price discovery and intelligent order pricing with margin padding
- Automatic leverage validation against asset limits
- Smart order execution with market data integration

Keep it concise and user-friendly.`
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