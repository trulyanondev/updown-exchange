import MarketDataService from '../services/marketdata.js';

/**
 * Agent callable tool definitions for market data operations
 * These functions can be called directly by internal LLM agents
 */

export const marketDataTools = {
  /**
   * Get current price for a token symbol
   */
  getCurrentPrice: {
    name: "get_current_price",
    description: "Get the current mid price for a cryptocurrency symbol (e.g., BTC, ETH, SOL)",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The cryptocurrency symbol (e.g., 'BTC', 'ETH', 'SOL')"
        }
      },
      required: ["symbol"]
    },
    handler: async (params: { symbol: string }) => {
      return await MarketDataService.getCurrentPrice(params.symbol);
    }
  },

  /**
   * Get perpetual metadata for a token symbol
   */
  getPerpMetadata: {
    name: "get_perp_metadata",
    description: "Get perpetual trading metadata for a symbol including assetId, maxLeverage, and other trading parameters",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The cryptocurrency symbol (e.g., 'BTC', 'ETH', 'SOL')"
        }
      },
      required: ["symbol"]
    },
    handler: async (params: { symbol: string }) => {
      return await MarketDataService.getPerpMetadata(params.symbol);
    }
  },

  /**
   * Get all available perpetual trading symbols
   */
  getAllPerpSymbols: {
    name: "get_all_perp_symbols",
    description: "Get all available perpetual trading symbols on Hyperliquid exchange",
    parameters: {
      type: "object",
      properties: {},
      required: []
    },
    handler: async () => {
      return await MarketDataService.getAllPerpSymbols();
    }
  }
};

/**
 * Helper function to execute market data tools
 * Can be used by agent frameworks to call the appropriate tool handler
 */
export async function executeMarketDataTool(toolName: string, params: any) {
  // Try to find tool by name property first
  let tool = Object.values(marketDataTools).find(t => t.name === toolName);
  
  // Fallback to finding by object key
  if (!tool) {
    tool = marketDataTools[toolName as keyof typeof marketDataTools];
  }
  
  if (!tool) {
    throw new Error(`Unknown market data tool: ${toolName}`);
  }

  return await tool.handler(params);
}

/**
 * Get tool definitions in OpenAI function calling format
 * Can be passed directly to LLM APIs that support function calling
 */
export function getMarketDataToolDefinitions() {
  return Object.values(marketDataTools).map(tool => ({
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
export function getMCPMarketDataToolDefinitions() {
  return {
    tools: Object.values(marketDataTools).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters
    })),
    server_info: {
      name: "Perpetuals Trading Market Data Tools",
      version: "1.0.0",
      description: "Internal agent tools for market data operations",
      access: "internal_only"
    }
  };
}

export default marketDataTools;