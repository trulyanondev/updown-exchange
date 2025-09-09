#!/bin/bash

echo "🔍 Verifying build configuration..."

# Check if package.json has correct Node.js version
echo "📦 Checking package.json engines..."
if grep -q '"node": ">=24.0.0"' package.json; then
    echo "✅ Node.js engine requirement is correct (>=24.0.0)"
else
    echo "❌ Node.js engine requirement is incorrect"
    exit 1
fi

# Check if hyperliquid version is correct
echo "📦 Checking hyperliquid version..."
if grep -q '"@nktkas/hyperliquid": "\^0.24.2"' package.json; then
    echo "✅ Hyperliquid version is correct (^0.24.2)"
else
    echo "❌ Hyperliquid version is incorrect"
    exit 1
fi

# Check if Dockerfile exists and uses Node.js 24
echo "🐳 Checking Dockerfile..."
if [ -f "Dockerfile" ]; then
    if grep -q "FROM node:24" Dockerfile; then
        echo "✅ Dockerfile uses Node.js 24"
    else
        echo "❌ Dockerfile doesn't use Node.js 24"
        exit 1
    fi
else
    echo "❌ Dockerfile not found"
    exit 1
fi

# Check if .dockerignore exists
echo "🐳 Checking .dockerignore..."
if [ -f ".dockerignore" ]; then
    echo "✅ .dockerignore exists"
else
    echo "❌ .dockerignore not found"
    exit 1
fi

# Check if yarn.lock exists
echo "📦 Checking yarn.lock..."
if [ -f "yarn.lock" ]; then
    echo "✅ yarn.lock exists"
else
    echo "❌ yarn.lock not found"
    exit 1
fi

echo ""
echo "🎉 All checks passed! Your configuration should work on Railway."
echo ""
echo "📋 Summary:"
echo "  - Node.js 24+ requirement: ✅"
echo "  - Hyperliquid ^0.24.2: ✅"
echo "  - Dockerfile with Node.js 24: ✅"
echo "  - .dockerignore: ✅"
echo "  - yarn.lock: ✅"
echo ""
echo "🚀 Ready to deploy to Railway!"
