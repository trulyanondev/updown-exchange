/**
 * Manual implementation of Privy wallet API requests
 * Required because the SDK doesn't support the user_id parameter
 */

import { WalletWithMetadata } from '@privy-io/server-auth';

/**
 * Manually fetch wallets for a specific user using Privy's REST API
 */
export async function getWallets(userId: string): Promise<WalletWithMetadata[]> {
  const appId = process.env.PRIVY_APP_ID || '';
  const appSecret = process.env.PRIVY_APP_SECRET || '';
  
  if (!appId || !appSecret) {
    throw new Error('Missing PRIVY_APP_ID or PRIVY_APP_SECRET environment variables');
  }

  // Create Basic Auth header
  const credentials = Buffer.from(`${appId}:${appSecret}`).toString('base64');
  
  try {
    const url = new URL('https://auth.privy.io/api/v1/wallets');
    url.searchParams.append('user_id', userId);
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'privy-app-id': appId,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch wallets: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching wallets:', error);
    throw error;
  }
}

/**
 * Get the first delegated wallet for a user
 */
export async function getDelegatedWallet(userId: string): Promise<WalletWithMetadata | undefined> {
  try {
    const wallets = await getWallets(userId);
    
    return wallets.find(
      wallet => wallet.id && wallet.delegated === true
    );
  } catch (error) {
    console.error('Error getting delegated wallet:', error);
    return undefined;
  }
}