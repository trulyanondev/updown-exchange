import { GraphStateType } from "../shared_state.js";

interface AccountInfoGraphStatePosition {
    symbol: string;
    size: number;
    usdValue: number;
    longOrShort: "long" | "short";
    leverage: number;
    unrealized_gain_loss: number;
}

export function accountInfoFromState(state: GraphStateType): { positionsSummary: string, ordersSummary: string } {
    const clearinghouseState = state.clearinghouseState;
    const openOrders = state.openOrders;

    const portfolioPositions: AccountInfoGraphStatePosition[] = clearinghouseState ? clearinghouseState.assetPositions.filter(p => parseFloat(p.position.szi) !== 0).map(p => (
        {
            symbol: p.position.coin,
            size: parseFloat(p.position.szi),
            usdValue: parseFloat(p.position.positionValue),
            longOrShort: parseFloat(p.position.szi) > 0 ? "long" : "short",
            leverage: p.position.leverage.value,
            unrealized_gain_loss: parseFloat(p.position.unrealizedPnl)
        }
    )) : [];

    // Create summary of portfolio state to avoid deep type issues
    const positionsSummary = clearinghouseState ?
        `Active Positions: ${JSON.stringify({ positions: portfolioPositions }, null, 2)}` :
        "No portfolio data";

    const ordersSummary = openOrders ?
        `Open Orders: ${JSON.stringify({ orders: openOrders }, null, 2)}` :
        "No open orders";

    return { positionsSummary: positionsSummary, ordersSummary: ordersSummary };
}