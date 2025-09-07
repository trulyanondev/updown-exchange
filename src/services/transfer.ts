import { ethers } from 'ethers';
import { createPublicClient, http, encodeFunctionData, parseUnits, formatUnits, Chain } from 'viem';
import { arbitrum, base, optimism, polygon, mainnet } from 'viem/chains';
import { Network } from 'alchemy-sdk';
import { WalletWithMetadata } from '@privy-io/server-auth';
import { createSmartAccountClient } from 'permissionless';
import { toSimpleSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { entryPoint07Address } from 'viem/account-abstraction';
import PrivyAbstractWallet from '../wallet/privy_abstract_wallet.js';
import PrivyService from './privy.js';

// Standard ERC20 ABI for token transfers with EIP-2612 permit support
const ERC20_ABI = [
  {
    "inputs": [
      { "name": "to", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "transfer",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "account", "type": "address" }
    ],
    "name": "balanceOf",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "from", "type": "address" },
      { "name": "to", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "transferFrom",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" },
      { "name": "value", "type": "uint256" },
      { "name": "deadline", "type": "uint256" },
      { "name": "v", "type": "uint8" },
      { "name": "r", "type": "bytes32" },
      { "name": "s", "type": "bytes32" }
    ],
    "name": "permit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "owner", "type": "address" }],
    "name": "nonces",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "DOMAIN_SEPARATOR",
    "outputs": [{ "name": "", "type": "bytes32" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "name",
    "outputs": [{ "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "version",
    "outputs": [{ "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// Map Alchemy Network to Viem chain configurations
const getViemChain = (network: Network): Chain => {
  switch (network) {
    case Network.ETH_MAINNET:
      return mainnet;
    case Network.MATIC_MAINNET:
      return polygon;
    case Network.ARB_MAINNET:
      return arbitrum;
    case Network.OPT_MAINNET:
      return optimism;
    case Network.BASE_MAINNET:
      return base;
    default:
      throw new Error(`Unsupported network: ${network}`);
  }
};

// Map Alchemy Network to Pimlico chain identifiers
const getPimlicoChainName = (network: Network): string => {
  switch (network) {
    case Network.ETH_MAINNET:
      return 'ethereum';
    case Network.MATIC_MAINNET:
      return 'polygon';
    case Network.ARB_MAINNET:
      return 'arbitrum';
    case Network.OPT_MAINNET:
      return 'optimism';
    case Network.BASE_MAINNET:
      return 'base';
    default:
      throw new Error(`Unsupported network for Pimlico: ${network}`);
  }
};

export interface TransferParams {
  toAddress: `0x${string}`;
  fromWallet: WalletWithMetadata;
  tokenContractAddress: `0x${string}`;
  network: Network;
  amount: number;
}

export interface TransferResult {
  success: boolean;
  txHash?: `0x${string}`;
  error?: string;
}

class TransferService {
  
  /**
   * Send tokens from one address to another using PrivyAbstractWallet for signing and Pimlico for gasless execution
   */
  public async send(params: TransferParams): Promise<TransferResult> {
    const { toAddress, fromWallet, tokenContractAddress, network, amount } = params;
    const fromAddress = fromWallet.address as `0x${string}`;

    if (!fromWallet.id) {
      throw new Error('[TransferService] Wallet with address ' + fromAddress + ' is not delegated');
    }

    try {
      console.log(`[TransferService] Initiating gasless transfer: ${amount} tokens from ${fromAddress} to ${toAddress}`);
      console.log(`[TransferService] Network: ${network}, Token: ${tokenContractAddress}`);

      // Get Pimlico API key from environment variables
      const pimlicoApiKey = process.env.PIMLICO_API_KEY;
      
      if (!pimlicoApiKey) {
        throw new Error('Pimlico API key not found in environment variables');
      }

      // Get the viem chain configuration for the network
      const chain = getViemChain(network);
      const pimlicoChainName = getPimlicoChainName(network);
      const pimlicoUrl = `https://api.pimlico.io/v2/${pimlicoChainName}/rpc?apikey=${pimlicoApiKey}`;
      
      console.log(`[TransferService] Using Pimlico URL: ${pimlicoUrl}`);

      // Create public client for reading blockchain data
      const publicClient = createPublicClient({
        chain,
        transport: http()
      });

      // Create Pimlico client for paymaster services
      const pimlicoClient = createPimlicoClient({
        transport: http(pimlicoUrl),
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        }
      });

      // Get token decimals to properly format the amount
      const decimals = await publicClient.readContract({
        address: tokenContractAddress,
        abi: ERC20_ABI,
        functionName: 'decimals'
      });

      console.log(`[TransferService] Token decimals: ${decimals}`);

      // Convert amount to proper token units (with decimals)
      const tokenAmount = parseUnits(amount.toString(), decimals);
      
      console.log(`[TransferService] Transfer amount in wei: ${tokenAmount.toString()}`);

      // Check sender's token balance
      const balance = await publicClient.readContract({
        address: tokenContractAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [fromAddress]
      });

      const balanceFormatted = formatUnits(balance, decimals);
      console.log(`[TransferService] Sender balance: ${balanceFormatted} tokens`);

      if (balance < tokenAmount) {
        return {
          success: false,
          error: `Insufficient balance. Available: ${balanceFormatted}, Required: ${amount}`
        };
      }

      // Create PrivyAbstractWallet instance to use as provider for smart account
      const wallet = new PrivyAbstractWallet(fromWallet.id as string);
      
      // Create a provider-like object for the smart account
      const provider = {
        request: async ({ method, params }: { method: string; params?: any[] }) => {
          if (method === 'eth_requestAccounts') {
            return [fromAddress];
          }
          if (method === 'eth_accounts') {
            return [fromAddress];
          }
          if (method === 'eth_chainId') {
            return `0x${chain.id.toString(16)}`;
          }
          if (method === 'personal_sign' || method === 'eth_sign') {
            // For personal signing, we'd need to implement this in PrivyAbstractWallet
            throw new Error('Personal signing not implemented');
          }
          if (method === 'eth_signTypedData_v4') {
            if (!params || params.length < 2) {
              throw new Error('Invalid params for signTypedData');
            }
            const [address, typedData] = params;
            const parsedData = JSON.parse(typedData);
            
            return await wallet.signTypedData({
              domain: parsedData.domain,
              types: parsedData.types,
              primaryType: parsedData.primaryType,
              message: parsedData.message
            });
          }
          throw new Error(`Unsupported method: ${method}`);
        }
      };

      console.log('[TransferService] Creating simple smart account');
      
      // Create simple smart account with the wallet as owner
      const simpleSmartAccount = await toSimpleSmartAccount({
        owner: provider,
        client: publicClient,
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7"
        }
      });

      console.log('[TransferService] Smart account address:', simpleSmartAccount.address);
      console.log('[TransferService] Owner wallet address:', fromAddress, '→ Smart account:', simpleSmartAccount.address);

      // Create smart account client with Pimlico paymaster
      const smartAccountClient = createSmartAccountClient({
        account: simpleSmartAccount,
        chain,
        bundlerTransport: http(pimlicoUrl),
        paymaster: pimlicoClient,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast;
          },
        }
      });

      // Check if the smart account already has allowance to spend EOA's tokens
      console.log('[TransferService] Checking existing allowance...');
      
      const currentAllowance = await publicClient.readContract({
        address: tokenContractAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [fromAddress, simpleSmartAccount.address]
      });
      
      console.log('[TransferService] Current allowance:', currentAllowance.toString());
      
      // Set unlimited approval amount (2^256 - 1)
      const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
      
      let permitTxHash = '';
      
      // Only proceed with permit if the allowance is insufficient
      if (currentAllowance < tokenAmount) {
        console.log('[TransferService] Allowance insufficient, setting up gasless approval using permit');
        
        // Set up parameters for the permit signature
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
        
        try {
          // Check if the token supports EIP-2612 permit
          const domainSeparator = await publicClient.readContract({
            address: tokenContractAddress,
            abi: ERC20_ABI,
            functionName: 'DOMAIN_SEPARATOR'
          });
          
          console.log('[TransferService] Token supports permit. Domain separator:', domainSeparator);
          
          // Get the current nonce for the owner
          const nonceValue = await publicClient.readContract({
            address: tokenContractAddress,
            abi: ERC20_ABI,
            functionName: 'nonces',
            args: [fromAddress]
          });
          
          console.log('[TransferService] Current nonce:', nonceValue.toString());
          
          // Get token name and version for EIP-712 domain
          const tokenName = await publicClient.readContract({
            address: tokenContractAddress,
            abi: ERC20_ABI,
            functionName: 'name'
          });
          
          let tokenVersion = '1'; // Default version
          try {
            tokenVersion = await publicClient.readContract({
              address: tokenContractAddress,
              abi: ERC20_ABI,
              functionName: 'version'
            });
          } catch (versionError) {
            console.log('[TransferService] Token version not available, using default "1"');
            // Some tokens like USDC use version "2"
            if (tokenName.toLowerCase().includes('usd coin')) {
              tokenVersion = '2';
            }
          }
          
          console.log('[TransferService] Token name:', tokenName, 'version:', tokenVersion);
          
          // Get chain ID
          const chainId = await publicClient.getChainId();
          
          // Build the domain data following EIP-712
          const domain = {
            name: tokenName,
            version: tokenVersion,
            chainId,
            verifyingContract: tokenContractAddress
          };
          
          // Define types for the permit function
          const types = {
            Permit: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' }
            ]
          };
          
          // The data to sign - use max uint256 for infinite approval
          const signPermitData = {
            owner: fromAddress,
            spender: simpleSmartAccount.address,
            value: maxUint256.toString(),
            nonce: nonceValue.toString(),
            deadline
          };
          
          console.log('[TransferService] Signing permit message for infinite approval...');
          
          // Sign the permit message using PrivyAbstractWallet
          const signature = await wallet.signTypedData({
            domain,
            types,
            primaryType: 'Permit',
            message: signPermitData
          });
          
          console.log('[TransferService] Permit signature:', signature);
          
          // Split the signature into r, s, v components
          const sig = ethers.Signature.from(signature);
          const { r, s, v } = sig;
          
          console.log('[TransferService] Signature components - v:', v, 'r:', r, 's:', s);
          
          // Execute the permit transaction through the smart account
          console.log('[TransferService] Submitting permit transaction through smart account...');
          
          // Encode the permit function call with infinite approval
          const permitCallData = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'permit',
            args: [
              fromAddress,
              simpleSmartAccount.address,
              maxUint256,
              BigInt(deadline),
              v,
              r as `0x${string}`,
              s as `0x${string}`
            ]
          });
          
          // Execute the permit transaction using the smart account
          permitTxHash = await smartAccountClient.sendTransaction({
            to: tokenContractAddress,
            data: permitCallData,
            value: BigInt(0)
          });
          
          console.log('[TransferService] Permit transaction submitted. Hash:', permitTxHash);
          console.log('[TransferService] Waiting for permit confirmation...');
          
          // Wait a moment for the transaction to be processed
          await new Promise(resolve => setTimeout(resolve, 5000));
          
        } catch (permitError: any) {
          console.error('[TransferService] Permit not supported or failed:', permitError);
          throw new Error('Gasless approval not supported for this token');
        }
      } else {
        console.log('[TransferService] Smart account already has sufficient allowance. Skipping permit step.');
      }
      
      // Now that the smart account has permission to spend the EOA's tokens,
      // use the smart account to execute transferFrom to transfer directly from EOA to the destination
      console.log('[TransferService] Executing transferFrom to move tokens directly from EOA to destination');
      
      // Encode the transferFrom function call
      const transferFromData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transferFrom',
        args: [fromAddress, toAddress, tokenAmount]
      });
      
      // Execute the transferFrom transaction using the smart account
      // This moves tokens directly from EOA to destination, with gas paid by the smart account
      const txHash = await smartAccountClient.sendTransaction({
        to: tokenContractAddress,
        data: transferFromData,
        value: BigInt(0)
      });
      
      console.log('[TransferService] Gasless transfer complete. Transaction hash:', txHash);

      return {
        success: true,
        txHash
      };

    } catch (error) {
      console.error('[TransferService] Transfer failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}

export default new TransferService();