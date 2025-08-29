import TradingService, { TradingOrderParams, TradingLeverageParams } from '../services/trading.js';
import { marketDataTools } from './marketdata_tools.js';

/**
 * Agent callable tool definitions for trading operations
 * These functions can be called directly by internal LLM agents with walletId
 */

export const tradingTools = {
  // Market data tools
  ...marketDataTools,
  /**
   * Create a trading order on Hyperliquid
   */
  createOrder: {
    name: "create_order",
    description: "Create a trading order on Hyperliquid exchange for an authenticated user",
    parameters: {
      type: "object",
      properties: {
        walletId: {
          type: "string", 
          description: "User's delegated wallet ID"
        },
        assetId: {
          type: "number",
          description: "Asset ID for the trading pair (e.g., 0 for BTC, 1 for ETH)"
        },
        isBuy: {
          type: "boolean",
          description: "Whether this is a buy order (true) or sell order (false)"
        },
        price: {
          type: "string",
          description: "Order price as a string (e.g., '50000.5')"
        },
        size: {
          type: "string",
          description: "Order size as a string (e.g., '0.1')"
        },
        reduceOnly: {
          type: "boolean",
          description: "Whether this is a reduce-only order (optional, defaults to false)"
        },
        orderType: {
          type: "object",
          description: "Order type specification, {'limit': {'tif': 'Ioc'}} for limit and {'trigger': {'isMarket': true, 'triggerPx': '0', 'tpsl': 'tp'}} for market order"
        }
      },
      required: ["walletId", "assetId", "isBuy", "price", "size", "orderType"]
    },
    handler: async (params: { 
      walletId: string, 
      assetId: number, 
      isBuy: boolean, 
      price: string, 
      size: string, 
      reduceOnly?: boolean, 
      orderType: any 
    }) => {
      const orderParams: TradingOrderParams = {
        assetId: params.assetId,
        isBuy: params.isBuy,
        price: params.price,
        size: params.size,
        reduceOnly: params.reduceOnly || false,
        orderType: params.orderType
      };

      return await TradingService.createOrder(params.walletId, orderParams);
    }
  },

  /**
   * Update leverage for a specific asset
   */
  updateLeverage: {
    name: "update_leverage",
    description: "Update leverage for a specific asset on Hyperliquid exchange",
    parameters: {
      type: "object",
      properties: {
        walletId: {
          type: "string",
          description: "User's delegated wallet ID"
        },
        assetId: {
          type: "number",
          description: "Asset ID for the trading pair (e.g., 0 for BTC, 1 for ETH)"
        },
        leverage: {
          type: "number",
          description: "Leverage multiplier (1-50, e.g., 5 for 5x leverage)",
          minimum: 1,
          maximum: 50
        }
      },
      required: ["walletId", "assetId", "leverage"]
    },
    handler: async (params: {
      walletId: string,
      assetId: number,
      leverage: number
    }) => {
      const leverageParams: TradingLeverageParams = {
        assetId: params.assetId,
        leverage: params.leverage
      };

      console.log('update_leverage_agent_tool', params.walletId, leverageParams);

      return await TradingService.updateLeverage(params.walletId, leverageParams);
    }
  }
};

/**
 * Helper function to execute agent tools
 * Can be used by agent frameworks to call the appropriate tool handler
 */
export async function executeAgentTool(toolName: string, params: any) {
  // Try to find tool by name property first
  let tool = Object.values(tradingTools).find(t => t.name === toolName);
  
  // Fallback to finding by object key
  if (!tool) {
    tool = tradingTools[toolName as keyof typeof tradingTools];
  }
  
  if (!tool) {
    throw new Error(`Unknown trading tool: ${toolName}`);
  }

  return await tool.handler(params);
}

/**
 * Get tool definitions in OpenAI function calling format
 * Can be passed directly to LLM APIs that support function calling
 */
export function getToolDefinitions() {
  return Object.values(tradingTools).map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

/**
 * Get tool definitions in MCP format
 * Can be used with Model Context Protocol integrations
 */
export function getMCPToolDefinitions() {
  return {
    tools: Object.values(tradingTools).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters
    })),
    server_info: {
      name: "Perpetuals Trading & Market Data Tools",
      version: "1.0.0",
      description: "Internal agent tools for trading and market data operations",
      access: "internal_only"
    }
  };
}

export default tradingTools;