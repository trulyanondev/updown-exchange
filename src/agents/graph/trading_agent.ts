// LangGraph Trading Agent - Full Implementation
// Constructs a StateGraph workflow for trading operations

import { StateGraph, START, END } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import {
  getPerpInfoNode,
  getCurrentPriceNode,
  processLeverageUpdatesNode,
  executeOrdersNode,
  executeTpSlOrdersNode,
  cancelOrdersNode,
  summaryNode,
  analyzePromptSymbolsNode,
  analyzePromptLeverageUpdatesNode,
  analyzePromptRegularOrdersNode,
  analyzePromptTpSlNode,
  analyzePromptCancelOrdersNode,
  GraphState
} from "./index.js";

export interface AgentRequest {
  prompt: string;
  walletId: string;
  walletAddress: `0x${string}`;
}

export interface AgentResponse {
  success: boolean;
  message: string;
  actions?: any[];
  error?: string;
}

/**
 * LangGraph Trading Agent - Full Implementation
 * Orchestrates a multi-step trading workflow using StateGraph
 *
 * Workflow Steps:
 * 1. getPerpInfoNode - Fetch all perpetual contract metadata
 * 2a. analyzePromptSymbolsNode - Analyze user input to identify symbols
 * 2b. analyzePromptLeverageUpdatesNode - Analyze user input for leverage updates
 * 3. getCurrentPriceNode - Fetch current prices for symbols that need them
 * 4. processLeverageUpdatesNode - Update leverage for symbols that need it
 * 5. analyzePromptRegularOrdersNode - Analyze and convert regular orders to TradingOrderParams
 * 6. analyzePromptTpSlNode - Analyze and convert TP/SL orders to TradingOrderParams
 * 7. executeOrdersNode - Execute all pending regular orders
 * 8. executeTpSlOrdersNode - Execute all pending TP/SL orders after regular orders
 * 9. cancelOrdersNode - Cancel all pending order cancellations
 * 10. summaryNode - Generate contextual summary of operations performed
 */
class LangGraphTradingAgent {
  private workflow: any;

  constructor() {
    console.log('🚀 LangGraph Trading Agent initialized with full workflow');

    // Create the StateGraph with our custom state type using Annotation.Root
    this.workflow = new StateGraph(GraphState)
      // Add nodes to the graph
      .addNode("get_perp_info", getPerpInfoNode)
      .addNode("analyze_prompt_symbols", analyzePromptSymbolsNode)
      .addNode("analyze_prompt_leverage_updates", analyzePromptLeverageUpdatesNode)
      .addNode("analyze_prompt_regular_orders", analyzePromptRegularOrdersNode)
      .addNode("analyze_prompt_tp_sl", analyzePromptTpSlNode)
      .addNode("analyze_prompt_cancel_orders", analyzePromptCancelOrdersNode)
      .addNode("get_current_price", getCurrentPriceNode)
      .addNode("process_leverage_updates", processLeverageUpdatesNode)
      .addNode("execute_orders", executeOrdersNode)
      .addNode("execute_tpsl_orders", executeTpSlOrdersNode)
      .addNode("cancel_orders", cancelOrdersNode)
      .addNode("get_final_perp_info", getPerpInfoNode)
      .addNode("summary", summaryNode)

      // Define the workflow edges (sequential execution)
      .addEdge(START, "get_perp_info")

      // Concurrently execute all analyze nodes
      .addEdge("get_perp_info", "analyze_prompt_symbols")

      // get current price executes after all analyze nodes
      .addEdge("analyze_prompt_symbols", "get_current_price")

      .addEdge("get_current_price", "analyze_prompt_regular_orders")
      .addEdge("get_current_price", "analyze_prompt_tp_sl")
      .addEdge("get_current_price", "analyze_prompt_leverage_updates")
      .addEdge("get_current_price", "analyze_prompt_cancel_orders")
      
      .addEdge("analyze_prompt_leverage_updates", "process_leverage_updates")
      .addEdge("analyze_prompt_regular_orders", "process_leverage_updates")
      .addEdge("analyze_prompt_tp_sl", "process_leverage_updates")
      .addEdge("analyze_prompt_cancel_orders", "process_leverage_updates")

      .addEdge("process_leverage_updates", "execute_orders")

      .addEdge("execute_orders", "execute_tpsl_orders") // TP/SL orders must be executed after regular orders
      .addEdge("execute_tpsl_orders", "cancel_orders") // Cancel orders after all order executions
      .addEdge("cancel_orders", "get_final_perp_info") // fetch final account info for summary // TODO: use conditional edge if any actions were performed
      .addEdge("get_final_perp_info", "summary")
      
      .addEdge("summary", END)
  }

  /**
   * Process a trading prompt using the full LangGraph workflow
   *
   * @param request - The agent request with prompt and wallet ID
   * @returns Promise<AgentResponse> - Response with workflow results
   */
  async processPrompt(request: AgentRequest): Promise<AgentResponse> {
    try {
      console.log('🔄 Starting LangGraph workflow for:', request.prompt);

      // Initialize the state with required fields
      const initialState: Partial<typeof GraphState.State> = {
        messages: [new HumanMessage(request.prompt)],
        inputPrompt: request.prompt,
        walletId: request.walletId,
        walletAddress: request.walletAddress,
        currentPrices: {}
      };

      // Compile and execute the workflow
      const app = this.workflow.compile();

      console.log('▶️ Executing workflow...');
      const result = await app.invoke(initialState);

      console.log('✅ Workflow completed successfully');

      // Extract final message content for the response
      const finalMessage = result.messages[result.messages.length - 1];
      const finalMessageContent = finalMessage ? finalMessage.content : 'Workflow completed';

      // Check for errors in the final state
      if (result.error) {
        return {
          success: false,
          message: `Workflow completed with error: ${result.error}`,
          error: result.error,
          actions: [{
            type: 'workflow_error',
            message: result.error,
            finalState: result
          }]
        };
      }

      return {
        success: true,
        message: finalMessageContent,
        actions: [{
          type: 'workflow_completed',
          message: 'Trading workflow completed',
          finalState: result,
          currentPrices: result.currentPrices,
          allPerpMetadata: result.allPerpMetadata,
          leverageUpdateResults: result.leverageUpdateResults,
          orderCreationResults: result.orderCreationResults,
          tpslResults: result.tpslResults,
          orderCancellationResults: result.orderCancellationResults
        }]
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown workflow error';
      console.error('❌ Workflow execution failed:', error);

      return {
        success: false,
        message: `Workflow execution failed: ${errorMessage}`,
        error: errorMessage,
        actions: [{
          type: 'workflow_execution_error',
          message: errorMessage,
          error: error
        }]
      };
    }
  }
}

export default LangGraphTradingAgent;