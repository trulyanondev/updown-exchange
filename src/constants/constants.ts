class Constants {
    // Arbitrum
    static USDC_ARB_CONTRACT = "0xaf88d065e77c8cc2239327c5edb3a432268e5831" as `0x${string}`;
    static HYPERLIQUID_CONTRACT = "0x2df1c51e09aecf9cacb7bc98cb1742757f163df7" as `0x${string}`;
    static MIN_HYPERLIQUID_DEPOSIT_AMOUNT = 5; // minimum deposit amount in USDC Arbitrum
    
    // HLP Vault Address - this should be configured based on environment or obtained from Hyperliquid API
    static HLP_VAULT_ADDRESS = "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303" as `0x${string}`;
}

export default Constants;