import PrivyService from '../services/privy.js';

export interface PrivyWalletConfig {
  walletId: string;
  address: `0x${string}`;
}

export class PrivyAbstractWallet {
  private walletId: string;
  public address: string;

  constructor(config: PrivyWalletConfig) {
    this.walletId = config.walletId;
    this.address = config.address;
  }

  async signTypedData(params: {
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: string;
    };
    types: {
      [key: string]: {
        name: string;
        type: string;
      }[];
    };
    primaryType: string;
    message: Record<string, unknown>;
  }, options?: unknown): Promise<string> {
    try {
      const privyClient = PrivyService.getClient();
      
      // Use Privy's walletApi to sign typed data
      const response = await privyClient.walletApi.signTypedData({
        walletId: this.walletId,
        typedData: {
          domain: params.domain,
          types: params.types,
          primaryType: params.primaryType,
          message: params.message
        }
      });

      // Return the full signature as hex string (as expected by viem interface)
      return response.signature as `0x${string}`;
    } catch (error) {
      console.error('Privy wallet signing failed:', error);
      throw new Error('Failed to sign typed data with Privy wallet');
    }
  }

}

export default PrivyAbstractWallet;