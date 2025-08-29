import { kv } from '@vercel/kv';
import { PerpsMeta, PerpsUniverse } from '@nktkas/hyperliquid';
import HyperliquidService from './hyperliquid.js';

export interface PerpMetadata extends PerpsUniverse {
  assetId: number;
}

export interface PerpetualsUniverseDict {
  [name: string]: PerpMetadata;
}

class MarketDataService {
  private static readonly PERPETUALS_METADATA_KEY = 'perpetuals_metadata';
  private static readonly CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
  
  private static hyperliquidService: HyperliquidService = new HyperliquidService();

  async getPerpMetadata(symbol: string): Promise<PerpMetadata> {
    const universeDict = await MarketDataService.getPerpetualsMetadata();
    const metadata = universeDict[symbol];
    
    if (!metadata) {
      throw new Error(`Perpetual metadata not found for symbol: ${symbol}`);
    }
    
    return metadata;
  }

  /**
   * Get perpetuals universe dictionary with KV caching
   * Checks cache first, fetches from Hyperliquid API if not available, then caches for 24 hours
   * Returns a dictionary keyed by asset name with universe data including assetId
   */
  private static async getPerpetualsMetadata(): Promise<PerpetualsUniverseDict> {

    // Try to get from cache first
    const cachedData = await kv.get<PerpetualsUniverseDict>(MarketDataService.PERPETUALS_METADATA_KEY);
      
    if (cachedData) {
      return cachedData;
    }

    // Cache miss - fetch from Hyperliquid API
    const metadata = await MarketDataService.hyperliquidService.getPerpetualsMetadata();

    // Transform universe array into dictionary keyed by name
    const universeDict: PerpetualsUniverseDict = {};
    metadata.universe.forEach((universe, index) => {
      universeDict[universe.name] = {
        ...universe,
        assetId: index
      };
    });

    // Cache the result with 24-hour TTL
    await kv.setex(
      MarketDataService.PERPETUALS_METADATA_KEY,
      MarketDataService.CACHE_TTL_SECONDS,
      universeDict
    );

    console.log('Fetched and cached perpetuals universe dictionary');
    return universeDict;
  }
}

export default MarketDataService;