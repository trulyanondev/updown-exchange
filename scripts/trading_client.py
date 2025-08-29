#!/usr/bin/env python3
"""
Trading Client Script
Interactive client for Hyperliquid Trading API

Usage: python trading_client.py
"""

import requests
import json
import sys
from typing import Optional

class TradingClient:
    def __init__(self, base_url: str = "http://localhost:3030"):
        self.base_url = base_url
        self.token: Optional[str] = None
        self.headers = {"Content-Type": "application/json"}
        
    def set_token(self, token: str):
        """Set the authentication token"""
        self.token = token
        self.headers["Authorization"] = f"Bearer {token}"
        print("✅ Token set successfully!")
        
    def health_check(self) -> bool:
        """Check if the API server is running"""
        try:
            response = requests.get(f"{self.base_url}/health", timeout=5)
            if response.status_code == 200:
                print("✅ API server is running")
                return True
            else:
                print(f"❌ API server returned status {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"❌ Failed to connect to API server: {e}")
            return False
            
    def send_prompt(self, prompt: str) -> dict:
        """Send a trading prompt to the API"""
        if not self.token:
            return {"error": "Token not set. Use 'token <your_token>' first."}
            
        try:
            response = requests.post(
                f"{self.base_url}/api/prompt",
                headers=self.headers,
                json={"prompt": prompt},
                timeout=120
            )
            
            return response.json()
            
        except requests.exceptions.RequestException as e:
            return {"error": f"Request failed: {e}"}
    
    def update_leverage(self, asset_id: int, leverage: int) -> dict:
        """Direct leverage update (for testing)"""
        if not self.token:
            return {"error": "Token not set. Use 'token <your_token>' first."}
            
        try:
            response = requests.post(
                f"{self.base_url}/api/update_leverage",
                headers=self.headers,
                json={"assetId": asset_id, "leverage": leverage},
                timeout=30
            )
            
            return response.json()
            
        except requests.exceptions.RequestException as e:
            return {"error": f"Request failed: {e}"}
    
    def print_response(self, response: dict):
        """Pretty print API response"""
        if "error" in response:
            print(f"❌ Error: {response['error']}")
            if "details" in response:
                print(f"   Details: {response['details']}")
        else:
            success = response.get("success", False)
            status = "✅" if success else "❌"
            print(f"{status} {response.get('message', 'No message')}")
            
            if "actions" in response and response["actions"]:
                print("\n📋 Actions executed:")
                for i, action in enumerate(response["actions"], 1):
                    action_status = "✅" if action.get("success") else "❌"
                    tool = action.get("tool", "unknown")
                    print(f"  {i}. {action_status} {tool}")
                    if not action.get("success") and "error" in action:
                        print(f"     Error: {action['error']}")

def main():
    client = TradingClient()
    
    print("🚀 Hyperliquid Trading Client")
    print("=" * 50)
    
    # Check if server is running
    if not client.health_check():
        print("Please make sure the API server is running on port 3030")
        sys.exit(1)
    
    print("\n📝 Commands:")
    print("  token <jwt_token>     - Set authentication token")
    print("  help                  - Show available commands")
    print("  leverage <asset> <lev> - Direct leverage update (0=BTC, 1=ETH)")
    print("  quit/exit             - Exit the client")
    print("  <any other text>      - Send as trading prompt to AI agent")
    print()
    
    while True:
        try:
            user_input = input("💬 > ").strip()
            
            if not user_input:
                continue
                
            if user_input.lower() in ["quit", "exit", "q"]:
                print("👋 Goodbye!")
                break
                
            elif user_input.lower() == "help":
                print("\n📖 Available Commands:")
                print("  • Natural language prompts (e.g., 'Set BTC leverage to 20x')")
                print("  • 'token <your_jwt>' to authenticate")
                print("  • 'leverage <asset_id> <leverage>' for direct API call")
                print("  • 'quit' to exit")
                print("\n💡 Example prompts:")
                print("  - 'Set BTC leverage to 25x'")
                print("  - 'Buy 0.1 ETH at market price'")
                print("  - 'Sell 0.05 BTC at 95000'")
                print()
                
            elif user_input.lower().startswith("token "):
                token = user_input[6:].strip()
                if token:
                    client.set_token(token)
                else:
                    print("❌ Please provide a token after 'token'")
                    
            elif user_input.lower().startswith("leverage "):
                parts = user_input.split()
                if len(parts) == 3:
                    try:
                        asset_id = int(parts[1])
                        leverage = int(parts[2])
                        print(f"🔄 Setting asset {asset_id} leverage to {leverage}x...")
                        response = client.update_leverage(asset_id, leverage)
                        client.print_response(response)
                    except ValueError:
                        print("❌ Invalid format. Use: leverage <asset_id> <leverage>")
                else:
                    print("❌ Usage: leverage <asset_id> <leverage> (e.g., leverage 0 20)")
                    
            else:
                # Send as prompt to AI agent
                print(f"🤖 Processing: {user_input}")
                response = client.send_prompt(user_input)
                client.print_response(response)
                
        except KeyboardInterrupt:
            print("\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    main()