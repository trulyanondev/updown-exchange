import HyperliquidService from './hyperliquid.js';
import type { PerpsClearinghouseState, Order, AssetPosition, PortfolioPeriods } from '@nktkas/hyperliquid';

class PortfolioService {

    /**
     * Get user's clearinghouse state (portfolio positions)
     */
    static async getClearinghouseState(walletAddress: `0x${string}`): Promise<PerpsClearinghouseState> {
        const infoClient = HyperliquidService.infoClientInstance;
        const clearinghouseState = await infoClient.clearinghouseState({ user: walletAddress });
        console.log(`✅ Clearinghouse state:`, JSON.stringify(clearinghouseState, null, 2));
        return clearinghouseState;
    }

    /**
     * Get user's open orders
     */
    static async getOpenOrders(walletAddress: `0x${string}`): Promise<Order[]> {
        const infoClient = HyperliquidService.infoClientInstance;
        const openOrders = await infoClient.openOrders({ user: walletAddress });
        console.log(`✅ Open orders:`, JSON.stringify(openOrders, null, 2));
        return openOrders;
    }

    /**
     * Get user's portfolio performance metrics across different time periods
     */
    static async getPortfolioPerformance(walletAddress: `0x${string}`): Promise<PortfolioPeriods> {
        const infoClient = HyperliquidService.infoClientInstance;
        const portfolioPerformance = await infoClient.portfolio({ user: walletAddress });
        console.log(`✅ Portfolio performance:`, JSON.stringify(portfolioPerformance, null, 2));
        return portfolioPerformance;
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