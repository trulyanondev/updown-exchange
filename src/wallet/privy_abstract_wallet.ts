import PrivyService from '../services/privy.js';

export class PrivyAbstractWallet {
  private walletId: string;

  constructor(walletId: string) {
    this.walletId = walletId;
  }

  async signTypedData(params: {
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: `0x${string}`;
    };
    types: {
      [key: string]: {
        name: string;
        type: string;
      }[];
    };
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<`0x${string}`> {
    const privyClient = PrivyService.getClient();
      
    // Use Privy's walletApi to sign typed data
    const response = await privyClient.walletApi.ethereum.signTypedData({
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
  }
}

export default PrivyAbstractWallet;