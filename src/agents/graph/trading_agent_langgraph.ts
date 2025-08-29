import { StateGraph, END } from "@langchain/langgraph/state_graph";
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { executeAgentTool, getToolDefinitions } from '../../agent_tools/trading_tools.js';

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

// State interface for the workflow
interface TradingState {
  walletId: string;
  prompt: string;
  symbols: string[];
  currentSymbolIndex: number;
  processedSymbols: string[];
  failedSymbols: string[];
  results: any[];
  currentContext: any;
  error?: string;
  isComplete: boolean;
}

// Node functions for the workflow
const getSymbolsNode = async (state: TradingState): Promise<TradingState> => {
  try {
    console.log('🔍 Getting all available perpetual symbols...');
    const symbols = await executeAgentTool('get_all_perp_symbols', {});
    state.symbols = symbols;
    state.currentSymbolIndex = 0;
    console.log(`📊 Found ${symbols.length} symbols:`, symbols);
    return state;
  } catch (error) {
    state.error = `Failed to get symbols: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return state;
  }
};

const analyzePromptNode = async (state: TradingState): Promise<TradingState> => {
  try {
    console.log('🤖 Analyzing user prompt...');
    
    const model = xai('grok-3');
    const response = await generateText({
      model,
      messages: [
        {
          role: 'system',
          content: `You are a trading agent that analyzes user requests. Determine what action is needed:

Available actions:
- "update_leverage_all": Update leverage for all symbols
- "update_leverage_specific": Update leverage for specific symbols
- "create_orders": Create trading orders
- "get_info": Get information about symbols

Respond with ONLY a JSON object in this format:
{
  "action": "action_name",
  "details": "specific details about what to do",
  "symbols": ["symbol1", "symbol2"] // if specific symbols mentioned
}

Examples:
- "Update all tokens to max leverage" → {"action": "update_leverage_all", "details": "Update all symbols to maximum leverage"}
- "Buy $100 of BTC" → {"action": "create_orders", "details": "Create buy order for $100 of BTC", "symbols": ["BTC"]}`
        },
        {
          role: 'user',
          content: state.prompt
        }
      ]
    });

    let analysis;
    try {
      analysis = JSON.parse(response.text);
    } catch (parseError) {
      state.error = `Failed to parse AI response: ${parseError}`;
      return state;
    }

    state.currentContext = analysis;
    console.log('📋 Prompt analysis:', analysis);
    return state;
  } catch (error) {
    state.error = `Failed to analyze prompt: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return state;
  }
};

const processSymbolNode = async (state: TradingState): Promise<TradingState> => {
  try {
    if (state.currentSymbolIndex >= state.symbols.length) {
      state.isComplete = true;
      return state;
    }

    const symbol = state.symbols[state.currentSymbolIndex];
    console.log(`🔄 Processing symbol ${state.currentSymbolIndex + 1}/${state.symbols.length}: ${symbol}`);

    // Get metadata for the symbol
    const metadata = await executeAgentTool('get_perp_metadata', { symbol });
    state.currentContext.assetId = metadata.assetId;
    state.currentContext.maxLeverage = metadata.maxLeverage;

    // Execute the required action based on context
    if (state.currentContext.action === 'update_leverage_all') {
      const result = await executeAgentTool('update_leverage', {
        walletId: state.walletId,
        assetId: metadata.assetId,
        leverage: metadata.maxLeverage
      });

      state.results.push({
        tool: 'update_leverage',
        symbol,
        success: true,
        result,
        assetId: metadata.assetId,
        leverage: metadata.maxLeverage
      });

      state.processedSymbols.push(symbol);
      console.log(`✅ Updated ${symbol} to ${metadata.maxLeverage}x leverage`);
    }

    state.currentSymbolIndex++;
    return state;
  } catch (error) {
    const symbol = state.symbols[state.currentSymbolIndex];
    console.error(`❌ Failed to process ${symbol}:`, error);
    
    state.results.push({
      tool: 'process_symbol',
      symbol,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    state.failedSymbols.push(symbol);
    state.currentSymbolIndex++;
    return state;
  }
};

const createOrderNode = async (state: TradingState): Promise<TradingState> => {
  try {
    if (!state.currentContext.symbols || state.currentContext.symbols.length === 0) {
      state.error = 'No symbols specified for order creation';
      return state;
    }

    const symbol = state.currentContext.symbols[0];
    console.log(`📝 Creating order for ${symbol}...`);

    // Get metadata and current price
    const metadata = await executeAgentTool('get_perp_metadata', { symbol });
    const currentPrice = await executeAgentTool('get_current_price', { symbol });

    // Calculate padded price (add 0.1% for buy orders)
    const paddedPrice = (currentPrice * 1.001).toFixed(2);
    const size = "0.001"; // Default size, could be calculated from dollar amount

    const result = await executeAgentTool('create_order', {
      walletId: state.walletId,
      assetId: metadata.assetId,
      isBuy: true,
      price: paddedPrice,
      size,
      orderType: { "limit": { "tif": "Ioc" } }
    });

    state.results.push({
      tool: 'create_order',
      symbol,
      success: true,
      result,
      price: paddedPrice,
      size
    });

    console.log(`✅ Created order for ${symbol} at ${paddedPrice}`);
    return state;
  } catch (error) {
    state.error = `Failed to create order: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return state;
  }
};

const generateResponseNode = async (state: TradingState): Promise<TradingState> => {
  try {
    console.log('📝 Generating final response...');
    
    const model = xai('grok-3');
    const response = await generateText({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a trading assistant. Summarize the results of trading actions in a friendly, concise way.'
        },
        {
          role: 'user',
          content: `Original request: ${state.prompt}

Results: ${JSON.stringify(state.results, null, 2)}

Processed: ${state.processedSymbols.length} symbols
Failed: ${state.failedSymbols.length} symbols
Total symbols: ${state.symbols.length}

Please provide a clear summary of what was accomplished.`
        }
      ]
    });

    state.currentContext.finalMessage = response.text;
    return state;
  } catch (error) {
    state.error = `Failed to generate response: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return state;
  }
};

// Conditional edge function to determine next step
const shouldContinue = (state: TradingState): string => {
  if (state.error) {
    return 'end';
  }

  if (state.currentContext.action === 'create_orders') {
    return 'create_order';
  }

  if (state.currentContext.action === 'update_leverage_all' && !state.isComplete) {
    return 'process_symbol';
  }

  return 'generate_response';
};

// Create the state graph
const createTradingWorkflow = () => {
  const workflow = new StateGraph<TradingState>({
    channels: {
      walletId: "",
      prompt: "",
      symbols: [],
      currentSymbolIndex: 0,
      processedSymbols: [],
      failedSymbols: [],
      results: [],
      currentContext: {},
      error: undefined,
      isComplete: false
    }
  });

  // Add nodes
  workflow.addNode("get_symbols", getSymbolsNode);
  workflow.addNode("analyze_prompt", analyzePromptNode);
  workflow.addNode("process_symbol", processSymbolNode);
  workflow.addNode("create_order", createOrderNode);
  workflow.addNode("generate_response", generateResponseNode);

  // Add edges
  workflow.addEdge("get_symbols", "analyze_prompt");
  workflow.addConditionalEdges("analyze_prompt", shouldContinue);
  workflow.addConditionalEdges("process_symbol", shouldContinue);
  workflow.addConditionalEdges("create_order", shouldContinue);
  workflow.addEdge("generate_response", END);

  // Set entry point
  workflow.setEntryPoint("get_symbols");

  return workflow.compile();
};

/**
 * LangGraph-based Trading Agent that handles complex multi-step workflows
 */
class TradingAgentLangGraph {
  private workflow;

  constructor() {
    this.workflow = createTradingWorkflow();
  }

  /**
   * Process a trading prompt using LangGraph workflow
   */
  async processPrompt(request: AgentRequest): Promise<AgentResponse> {
    try {
      console.log('🚀 Starting LangGraph trading workflow...');
      
      // Initialize state
      const initialState: TradingState = {
        walletId: request.walletId,
        prompt: request.prompt,
        symbols: [],
        currentSymbolIndex: 0,
        processedSymbols: [],
        failedSymbols: [],
        results: [],
        currentContext: {},
        isComplete: false
      };

      // Execute workflow
      const result = await this.workflow.invoke(initialState);
      
      console.log('✅ LangGraph workflow completed');
      console.log('📊 Final state:', {
        processed: result.processedSymbols.length,
        failed: result.failedSymbols.length,
        total: result.symbols.length
      });

      // Check for errors
      if (result.error) {
        return {
          success: false,
          message: `Workflow failed: ${result.error}`,
          error: result.error
        };
      }

      // Format results for compatibility with existing API
      const actions = result.results.map((result, index) => ({
        tool: result.tool,
        success: result.success,
        result: result.result,
        symbol: result.symbol,
        reasoning: `Processed ${result.symbol} (${index + 1}/${result.results.length})`,
        params: { symbol: result.symbol, ...result }
      }));

      return {
        success: true,
        message: result.currentContext.finalMessage || 'Workflow completed successfully',
        actions
      };

    } catch (error) {
      console.error('LangGraph trading agent error:', error);
      
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
    return `I am a LangGraph-powered trading agent that can:

🚀 **Complex Workflows**: Handle multi-step operations like updating all tokens to max leverage
🔄 **Iterative Processing**: Process multiple items one by one with progress tracking
📊 **State Management**: Maintain context and progress across all operations
🛡️ **Error Recovery**: Continue processing even if some items fail
📈 **Batch Operations**: Efficiently handle large numbers of symbols

I can:
- Update leverage for all available trading symbols
- Create orders for specific assets
- Process complex multi-step trading requests
- Track progress and provide detailed results
- Handle errors gracefully and continue processing

Try asking me to "Update all available perpetual tokens to their maximum leverage" and I'll process them systematically!`;
  }
}

export default TradingAgentLangGraph;
