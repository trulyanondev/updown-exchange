// LangGraph Trading Agent - Full Implementation
// Constructs a StateGraph workflow for trading operations

import { StateGraph, START, END } from "@langchain/langgraph";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import {
  getPerpInfoNode,
  analyzeInputNode,
  getCurrentPriceNode,
  GraphState
} from "./index.js";
import type { GraphStateType } from "./shared_state.js";

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
 * 2. analyzeInputNode - Analyze user input to determine required symbols/prices
 * 3. getCurrentPriceNode - Fetch current prices for symbols that need them
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

      // Define the workflow edges (sequential execution)
      .addEdge(START, "get_perp_info")
      .addEdge("get_perp_info", "analyze_input")
      .addEdge("analyze_input", "get_current_price")
      .addEdge("get_current_price", END)

    console.log('✅ StateGraph constructed with nodes: get_perp_info → analyze_input → get_current_price');
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
          message: 'Trading analysis completed',
          finalState: result,
          currentPrices: result.currentPrices,
          allPerpMetadata: result.allPerpMetadata
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

  /**
   * Get workflow capabilities and current implementation details
   */
  async getCapabilities(): Promise<string> {
    return `
LangGraph Trading Agent (Full Implementation)

Current Status: ✅ Active and operational
Workflow Architecture:
1. 📊 getPerpInfoNode - Fetches all perpetual contract metadata
2. 🧠 analyzeInputNode - Uses GPT to analyze user input and determine required symbols
3. 💰 getCurrentPriceNode - Fetches current prices for symbols that need them

Features:
- ✅ Multi-step workflow orchestration
- ✅ Intelligent input analysis with GPT
- ✅ Concurrent price fetching
- ✅ Comprehensive error handling
- ✅ State management across all nodes
- ✅ Tool message communication

Technical Details:
- StateGraph with custom GraphState type
- Sequential node execution: get_perp_info → analyze_input → get_current_price
- Concurrent price fetching for optimal performance
- GPT-powered natural language analysis
- Full TypeScript type safety

Usage Examples:
- "buy $10 of bitcoin" → Analyzes, determines BTC needs price, fetches price
- "update ETH leverage to 5x" → Analyzes, determines no price needed, skips fetching
- "show me BTC and SOL prices" → Analyzes, fetches both prices concurrently
    `.trim();
  }

  /**
   * Get the current workflow structure for debugging/visualization
   */
  getWorkflowStructure(): string {
    return `
Workflow Structure:
┌─────────────────┐    ┌──────────────────┐    ┌────────────────────┐
│ get_perp_info   │ -> │ analyze_input    │ -> │ get_current_price  │
│ (Fetch metadata)│    │ (GPT analysis)   │    │ (Concurrent fetch) │
└─────────────────┘    └──────────────────┘    └────────────────────┘
    `.trim();
  }
}

export default LangGraphTradingAgent;

// Export the actual trading workflow for external use
export const createTradingWorkflow = () => {
  console.log('🚀 Creating full LangGraph trading workflow');

  const workflow = new StateGraph(GraphState)
    .addNode("get_perp_info", getPerpInfoNode)
    .addNode("analyze_input", analyzeInputNode)
    .addNode("get_current_price", getCurrentPriceNode)
    .addEdge("get_perp_info", "analyze_input")
    .addEdge("analyze_input", "get_current_price")
    .setEntryPoint("get_perp_info");

  return workflow.compile();
};