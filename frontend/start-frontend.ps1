# Start Frontend Development Server
# Run this script from the frontend directory

Write-Host "🚀 Starting HMS Frontend..." -ForegroundColor Cyan

# Check if node_modules exists
if (-Not (Test-Path "node_modules")) {
    Write-Host "❌ Node modules not found!" -ForegroundColor Red
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install dependencies!" -ForegroundColor Red
        exit 1
    }
}

# Check if .env exists
if (-Not (Test-Path ".env")) {
    Write-Host "⚠️  Warning: .env file not found!" -ForegroundColor Yellow
    Write-Host "Creating default .env file..." -ForegroundColor Yellow
    
    @"
# API Configuration
VITE_API_BASE_URL=http://localhost:8000
VITE_API_PREFIX=/api/v1

# Application
VITE_APP_NAME=HMS
VITE_APP_VERSION=1.0.0
"@ | Out-File -FilePath ".env" -Encoding UTF8
    
    Write-Host "✅ Created .env file with default settings" -ForegroundColor Green
}

# Start Vite dev server
Write-Host ""
Write-Host "🌐 Starting Vite dev server..." -ForegroundColor Green
Write-Host "📱 Frontend will be available at: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

npm run dev
