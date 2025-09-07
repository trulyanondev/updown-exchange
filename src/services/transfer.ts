import { encodeFunctionData, parseUnits, createPublicClient, http, Chain } from 'viem';
import { arbitrum, base, mainnet, optimism } from 'viem/chains';
import { Network } from 'alchemy-sdk';
import { WalletWithMetadata } from '@privy-io/server-auth';
import PrivyService from './privy.js';

export interface TransferParams {
  toAddress: `0x${string}`;
  fromWallet: WalletWithMetadata;
  tokenContractAddress: `0x${string}`;
  network: Network;
  amount: number;
}

export interface TransferResult {
  success: boolean;
  txHash?: string;
  error?: string;
}
const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

const networkToCaip2 = (network: Network): `eip155:${string}` => {
  switch (network) {
    case Network.ARB_MAINNET:
      return "eip155:" + arbitrum.id.toString() as `eip155:${string}`;
    case Network.BASE_MAINNET:
      return "eip155:" + base.id.toString() as `eip155:${string}`;
    case Network.OPT_MAINNET:
      return "eip155:" + optimism.id.toString() as `eip155:${string}`;
    case Network.ETH_MAINNET:
      return "eip155:1" as `eip155:${string}`;
    default:
      throw new Error('Unsupported network');
  }
}

const networkToChain = (network: Network): Chain => {

  switch (network) {
    case Network.ARB_MAINNET:
      return arbitrum;
    case Network.BASE_MAINNET:
      return base;
    case Network.OPT_MAINNET:
      return optimism;
    case Network.ETH_MAINNET:
      return mainnet;
    default:
      throw new Error('Unsupported network');
  }
}

const networkToRpcUrl = (network: Network): string => {
  let key = process.env.ALCHEMY_API_KEY!;
  switch (network) {
    case Network.ARB_MAINNET:
      return `https://arb-mainnet.g.alchemy.com/v2/${key}`;
    case Network.BASE_MAINNET:
      return `https://base-mainnet.g.alchemy.com/v2/${key}`;
    case Network.OPT_MAINNET:
      return `https://opt-mainnet.g.alchemy.com/v2/${key}`;
    case Network.ETH_MAINNET:
      return `https://eth-mainnet.g.alchemy.com/v2/${key}`;
    default:
      throw new Error('Unsupported network');
  }
}

class TransferService {
  
  private static async getDecimals(network: Network, tokenContractAddress: `0x${string}`): Promise<number> {
    const publicClient = createPublicClient({
      chain: networkToChain(network),
      transport: http(networkToRpcUrl(network))
    });
    return await publicClient.readContract({
      address: tokenContractAddress,
      abi: ERC20_ABI,
      functionName: 'decimals'
    }) as number;
  }

  public static async getBalance(
    network: Network, 
    tokenContractAddress: `0x${string}`, 
    fromWallet: WalletWithMetadata
  ): Promise<number> {
    
    const publicClient = createPublicClient({
      chain: networkToChain(network),
      transport: http(networkToRpcUrl(network))
    });

    const decimals = await this.getDecimals(network, tokenContractAddress);

    const balance = await publicClient.readContract({
      address: tokenContractAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [fromWallet.address as `0x${string}`]
    });

    return Number(balance) / 10 ** decimals;
  }

  /**
   * Send tokens from one address to another using PrivyAbstractWallet for signing and Pimlico for gasless execution
   */
  public static async send(params: TransferParams): Promise<TransferResult> {
    try {
      const { toAddress, fromWallet, tokenContractAddress, network, amount } = params;

      if (!fromWallet.id) {
        throw new Error('Wallet ID is required');
      }

      if (!fromWallet.address) {
        throw new Error('Wallet address is required');
      }

      const decimals = await this.getDecimals(network, tokenContractAddress);

      const transferAmount = parseUnits(amount.toString(), decimals);

      if (transferAmount === 0n) {
        throw new Error('No balance to transfer');
      }

      const response = await PrivyService.getClient().walletApi.ethereum.sendTransaction({
        walletId: fromWallet.id,
        caip2: networkToCaip2(network),
        sponsor: true,
        transaction: {
          to: tokenContractAddress,
          data: encodeFunctionData({ 
            abi: ERC20_ABI, 
            functionName: 'transfer', 
            args: [toAddress, transferAmount] 
          })
        },
      });

      return {
        success: true,
        txHash: response.hash
      };

    } catch (error) {
      console.error('Transfer failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export default TransferService;