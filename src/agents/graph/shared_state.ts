import { BaseMessage } from "@langchain/core/messages";
import { PerpetualsUniverseDict } from "../../services/marketdata.js";
import { OrderResponse, SuccessResponse, PerpsClearinghouseState, Order, CancelSuccessResponse, ExchangeClient } from "@nktkas/hyperliquid";
import { Annotation } from "@langchain/langgraph";
import { TradingOrderParams } from "../../services/trading.js";

// Shared state definition using Annotation.Root for modern StateGraph
export const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  walletAddress: Annotation<`0x${string}`>({
    reducer: (x, y) => y ?? x,
    default: () => "0x0000000000000000000000000000000000000000" as `0x${string}`
  }),
  // Exchange client for all trading operations (shared to prevent nonce conflicts)
  exchangeClient: Annotation<ExchangeClient>({
    reducer: (x, y) => y ?? x
  }),
  // Perpetual info properties
  allPerpMetadata: Annotation<PerpetualsUniverseDict | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  // All mentioned symbols
  mentionedSymbols: Annotation<string[] | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  // Current price properties
  currentPrices: Annotation<Record<string, number | undefined>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({})
  }),
  // Portfolio state properties
  clearinghouseState: Annotation<PerpsClearinghouseState | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  openOrders: Annotation<Order[] | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  // Trading orders (assembled parameters)
  pendingOrders: Annotation<TradingOrderParams[] | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  // TP/SL orders (assembled parameters)  
  pendingTakeProfitStopLossOrders: Annotation<TradingOrderParams[] | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  // Order cancellations (order IDs to cancel)
  pendingOrderCancellations: Annotation<string[] | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  orderCancellationResults: Annotation<Record<string, { success: boolean; message: string; response?: CancelSuccessResponse; error?: string }> | undefined>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => undefined
  }),
  // Leverage updates
  pendingLeverageUpdates: Annotation<Record<string, number> | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  // Results of leverage update operations
  leverageUpdateResults: Annotation<Record<string, SuccessResponse> | undefined>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => undefined
  }),
  // Results of order creation operations
  orderCreationResults: Annotation<Record<string, { success: boolean; message: string; response?: OrderResponse; error?: string }> | undefined>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => undefined
  }),
  // Results of TP/SL order creation operations
  tpslResults: Annotation<Record<string, { success: boolean; message: string; response?: OrderResponse; error?: string }> | undefined>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => undefined
  }),
  // Error handling
  error: Annotation<string | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  })
});

// State type for node functions - inferred from Annotation.Root
export type GraphStateType = typeof GraphState.State;
