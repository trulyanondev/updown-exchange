import { createClient } from 'redis';
import { PerpsUniverse } from '@nktkas/hyperliquid';
import HyperliquidService from './hyperliquid.js';

export interface PerpMetadata extends PerpsUniverse {
  assetId: number;
}

export interface PerpetualsUniverseDict {
  [name: string]: PerpMetadata;
}

export interface CoinPrices {
    [coin: string]: number;
}

class MarketDataService {
  private static readonly PERPETUALS_METADATA_KEY = 'perpetuals_metadata';
  private static readonly PERPETUALS_METADATA_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

  private static readonly CURRENT_PRICES_KEY = 'current_prices';
  private static readonly CURRENT_PRICES_CACHE_TTL_SECONDS = 5; // 5 seconds
  
  private static hyperliquidService: HyperliquidService = new HyperliquidService();
  
  // Initialize Redis client lazily
  private static redisClient: any = null;
  
  private static async getRedis() {
    if (!MarketDataService.redisClient) {
      MarketDataService.redisClient = await createClient().connect();
    }
    return MarketDataService.redisClient;
  }

  async getPerpMetadata(symbol: string): Promise<PerpMetadata> {
    const universeDict = await MarketDataService.getPerpetualsMetadata();
    const metadata = universeDict[symbol.toLowerCase()];
    
    if (!metadata) {
      throw new Error(`Perpetual metadata not found for symbol: ${symbol}`);
    }
    
    return metadata;
  }
  
  async getCurrentPrice(symbol: string): Promise<number> {
    const currentPrices = await MarketDataService.getCurrentPrices();
    const price = currentPrices[symbol.toLowerCase()];
    if (!price) {
      throw new Error(`Current price not found for symbol: ${symbol}`);
    }
    return price;
  }

  /**
   * Get current prices for all assets with Redis caching
   * Checks cache first, fetches from Hyperliquid API if not available, then caches for 5 seconds
   */
  private static async getCurrentPrices(): Promise<CoinPrices> {
    try {
      const redis = await MarketDataService.getRedis();
      const cachedData = await redis.get(MarketDataService.CURRENT_PRICES_KEY);
      
      if (cachedData) {
        return JSON.parse(cachedData);
      }

      const mids = await MarketDataService.hyperliquidService.getAllMids();
      const currentPrices = Object.fromEntries(
          Object.entries(mids).map(([coin, midPx]) => [coin.toLowerCase(), Number(midPx)])
      );

      await redis.setEx(
        MarketDataService.CURRENT_PRICES_KEY,
        MarketDataService.CURRENT_PRICES_CACHE_TTL_SECONDS,
        JSON.stringify(currentPrices)
      );

      return currentPrices;
    } catch (error) {
      console.error('Redis error in getCurrentPrices, falling back to direct API call:', error);
      
      // Fallback to direct API call if Redis fails
      const mids = await MarketDataService.hyperliquidService.getAllMids();
      return Object.fromEntries(
          Object.entries(mids).map(([coin, midPx]) => [coin.toLowerCase(), Number(midPx)])
      );
    }
  }

  /**
   * Get perpetuals universe dictionary with Redis caching
   * Checks cache first, fetches from Hyperliquid API if not available, then caches for 24 hours
   * Returns a dictionary keyed by asset name with universe data including assetId
   */
  private static async getPerpetualsMetadata(): Promise<PerpetualsUniverseDict> {
    try {
      const redis = await MarketDataService.getRedis();
      const cachedData = await redis.get(MarketDataService.PERPETUALS_METADATA_KEY);
      
      if (cachedData) {
        return JSON.parse(cachedData);
      }

      // Cache miss - fetch from Hyperliquid API
      const metadata = await MarketDataService.hyperliquidService.getPerpetualsMetadata();

      // Transform universe array into dictionary keyed by name
      const universeDict: PerpetualsUniverseDict = {};
      metadata.universe.forEach((universe, index) => {
        universeDict[universe.name.toLowerCase()] = {
          ...universe,
          assetId: index
        };
      });

      // Cache the result with 24-hour TTL
      await redis.setEx(
        MarketDataService.PERPETUALS_METADATA_KEY,
        MarketDataService.PERPETUALS_METADATA_CACHE_TTL_SECONDS,
        JSON.stringify(universeDict)
      );

      console.log('Fetched and cached perpetuals universe dictionary');
      return universeDict;
    } catch (error) {
      console.error('Redis error in getPerpetualsMetadata, falling back to direct API call:', error);
      
      // Fallback to direct API call if Redis fails
      const metadata = await MarketDataService.hyperliquidService.getPerpetualsMetadata();
      
      const universeDict: PerpetualsUniverseDict = {};
      metadata.universe.forEach((universe, index) => {
        universeDict[universe.name.toLowerCase()] = {
          ...universe,
          assetId: index
        };
      });
      
      return universeDict;
    }
  }
}

export default MarketDataService;