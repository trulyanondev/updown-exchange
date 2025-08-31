import HyperliquidService from './hyperliquid.js';
import type { PerpsClearinghouseState, Order, AssetPosition, PortfolioPeriods } from '@nktkas/hyperliquid';

class PortfolioService {

    /**
     * Get user's clearinghouse state (portfolio positions)
     */
    static async getClearinghouseState(userAddress: `0x${string}`): Promise<PerpsClearinghouseState> {
        const infoClient = HyperliquidService.infoClientInstance;
        return await infoClient.clearinghouseState({ user: userAddress });
    }

    /**
     * Get user's open orders
     */
    static async getOpenOrders(userAddress: `0x${string}`): Promise<Order[]> {
        const infoClient = HyperliquidService.infoClientInstance;
        return await infoClient.openOrders({ user: userAddress });
    }

    /**
     * Get user's portfolio performance metrics across different time periods
     */
    static async getPortfolioPerformance(userAddress: `0x${string}`): Promise<PortfolioPeriods> {
        const infoClient = HyperliquidService.infoClientInstance;
        return await infoClient.portfolio({ user: userAddress });
    }


    // ------------------ Helper functions ------------------


    /**
     * Utility function to calculate total unrealized PnL from clearinghouse state
     */
    static calculateTotalUnrealizedPnl(clearinghouseState: PerpsClearinghouseState): number {
        return clearinghouseState.assetPositions.reduce(
            (sum, assetPosition) => sum + parseFloat(assetPosition.position.unrealizedPnl),
            0
        );
    }

    /**
     * Utility function to count open positions from clearinghouse state
     */
    static countOpenPositions(clearinghouseState: PerpsClearinghouseState): number {
        return clearinghouseState.assetPositions.filter(
            pos => parseFloat(pos.position.szi) !== 0
        ).length;
    }

    /**
     * Utility function to get account value as number
     */
    static getAccountValue(clearinghouseState: PerpsClearinghouseState): number {
        return parseFloat(clearinghouseState.marginSummary.accountValue);
    }

    /**
     * Utility function to get available balance as number
     */
    static getAvailableBalance(clearinghouseState: PerpsClearinghouseState): number {
        return parseFloat(clearinghouseState.withdrawable);
    }

    /**
     * Utility function to get total margin used as number
     */
    static getTotalMarginUsed(clearinghouseState: PerpsClearinghouseState): number {
        return parseFloat(clearinghouseState.marginSummary.totalMarginUsed);
    }
}

export default PortfolioService;