// LangGraph Trading Agent - Full Implementation
// Constructs a StateGraph workflow for trading operations

import { StateGraph, START, END } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import {
  getPerpInfoNode,
  analyzeInputNode,
  getCurrentPriceNode,
  processLeverageUpdatesNode,
  processOrderPromptsNode,
  executeOrdersNode,
  summaryNode,
  GraphState
} from "./index.js";

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
 * LangGraph Trading Agent - Full Implementation
 * Orchestrates a multi-step trading workflow using StateGraph
 *
 * Workflow Steps:
 * 1. getPerpInfoNode - Fetch all perpetual contract metadata
 * 2. analyzeInputNode - Analyze user input to determine required symbols/prices/orders/leverage
 * 3. getCurrentPriceNode - Fetch current prices for symbols that need them
 * 4. processLeverageUpdatesNode - Update leverage for symbols that need it
 * 5. processOrderPromptsNode - Convert order prompts to OrderParams
 * 6. executeOrdersNode - Execute all pending orders
 * 7. summaryNode - Generate contextual summary of operations performed
 */
class LangGraphTradingAgent {
  private workflow: any;

  constructor() {
    console.log('🚀 LangGraph Trading Agent initialized with full workflow');

    // Create the StateGraph with our custom state type using Annotation.Root
    this.workflow = new StateGraph(GraphState)
      // Add nodes to the graph
      .addNode("get_perp_info", getPerpInfoNode)
      .addNode("analyze_input", analyzeInputNode)
      .addNode("get_current_price", getCurrentPriceNode)
      .addNode("process_leverage_updates", processLeverageUpdatesNode)
      .addNode("process_order_prompts", processOrderPromptsNode)
      .addNode("execute_orders", executeOrdersNode)
      .addNode("summary", summaryNode)

      // Define the workflow edges (sequential execution)
      .addEdge(START, "get_perp_info")
      .addEdge("get_perp_info", "analyze_input")
      .addEdge("analyze_input", "get_current_price")
      .addEdge("get_current_price", "process_leverage_updates")
      .addEdge("process_leverage_updates", "process_order_prompts")
      .addEdge("process_order_prompts", "execute_orders")
      .addEdge("execute_orders", "summary")
      .addEdge("summary", END)

    console.log('✅ StateGraph constructed with nodes: get_perp_info → analyze_input → get_current_price → process_leverage_updates → process_order_prompts → execute_orders → summary');
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
          orderCreationResults: result.orderCreationResults
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