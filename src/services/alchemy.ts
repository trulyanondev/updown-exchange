import PrivyService from './privy.js';
import Constants from '../constants/constants.js';
import HyperliquidService from './hyperliquid.js';

class AlchemyService {

  /**
   * Verify webhook signature using Supabase function.  Returns true if the signature is valid, false otherwise.
   */
  static async verifyWebhookSignature(webhookId: string, body: any, signature: string): Promise<boolean> {
    const signatureResponse = await fetch('https://nefhbvdkknucokyoudxc.supabase.co/functions/v1/alchemy_webhook_signature', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Alchemy-Webhook-Id': webhookId
      },
      body: JSON.stringify(body)
    });

    const { signature: expectedSignature } = await signatureResponse.json();
    return expectedSignature == signature;
  }

  /**
   * Process webhook activity data
   */
  static async processWebhookActivity(event: any): Promise<void> {
    if (!event?.activity) {
      return;
    }

    // Process each activity in the webhook
    for (const activity of event.activity) {
      // Check if this is an incoming transfer (external transaction with positive value)
      if (
        activity.category === 'token' && 
        activity.rawContract.address.toLowerCase() === Constants.USDC_ARB_CONTRACT.toLowerCase() && 
        parseFloat(activity.value || '0') > 0) 
      {
        const userAddress = activity.toAddress;
        const user = await PrivyService.getClient().getUserByWalletAddress(userAddress);
        if (user) {
          await HyperliquidService.depositToHyperliquidExchange(user, userAddress as `0x${string}`);
        } 

        // Ignore all other activity for now
      }
    }
  }
}

export default AlchemyService;