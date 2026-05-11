# =============================================================================
# HACKATHON SETUP SCRIPT (PowerShell)
# =============================================================================
# This script sets up and runs the entire project for hackathon demos
# 
# Project Structure:
# - Frontend: React + Vite + TypeScript + Supabase (Port 5173)
# - Backend: FastAPI + Kafka + Pathway Engine (Port 8000)
# - Kafka: Required for message processing (localhost:9092)
#
# Usage:
#   .\hackathon-setup.ps1        # Interactive mode
#   .\hackathon-setup.ps1 all    # Install all dependencies
#   .\hackathon-setup.ps1 frontend  # Run frontend
#   .\hackathon-setup.ps1 backend  # Run backend API
#   .\hackathon-setup.ps1 processor  # Run Kafka processor
# =============================================================================

param(
    [string]$Command = "menu"
)

# Colors for output
$RED = "`e[0;31m"
$GREEN = "`e[0;32m"
$YELLOW = "`e[1;33m"
$BLUE = "`e[0;34m"
$NC = "`e[0m" # No Color

# Project paths
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$FRONTEND_DIR = $SCRIPT_DIR
$BACKEND_DIR = Join-Path $SCRIPT_DIR "services\backend"

Write-Host ""
Write-Host "$BLUE========================================$NC"
Write-Host "$BLUE  HACKATHON PROJECT SETUP SCRIPT$NC"
Write-Host "$BLUE========================================$NC"
Write-Host ""

# =============================================================================
# CHECK PREREQUISITES
# =============================================================================
function Test-Prerequisites {
    Write-Host "$YELLOW Checking prerequisites...$NC"
    
    # Check Node.js
    $nodeVersion = & node --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "$GREEN✓$NC Node.js: $nodeVersion"
    } else {
        Write-Host "$RED✗$NC Node.js not found. Please install Node.js 20+"
        exit 1
    }
    
    # Check npm
    $npmVersion = & npm --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "$GREEN✓$NC npm: $npmVersion"
    } else {
        Write-Host "$RED✗$NC npm not found. Please install npm"
        exit 1
    }
    
    # Check Python
    $pythonVersion = & py --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "$GREEN✓$NC Python: $pythonVersion"
    } else {
        $pythonVersion = & python --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "$GREEN✓$NC Python: $pythonVersion"
        } else {
            Write-Host "$RED✗$NC Python not found. Please install Python 3.11+"
            exit 1
        }
    }
    
    Write-Host "$GREEN All prerequisites satisfied!$NC"
    Write-Host ""
}

# =============================================================================
# SETUP FRONTEND
# =============================================================================
function Install-Frontend {
    Write-Host "$YELLOW Setting up Frontend...$NC"
    Write-Host "----------------------------------------"
    
    Set-Location $FRONTEND_DIR
    
    # Install dependencies if node_modules doesn't exist
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing frontend dependencies..."
        npm install
    } else {
        Write-Host "Frontend dependencies already installed."
    }
    
    Write-Host "$GREEN Frontend setup complete!$NC"
    Write-Host ""
}

# =============================================================================
# SETUP BACKEND
# =============================================================================
function Install-Backend {
    Write-Host "$YELLOW Setting up Backend...$NC"
    Write-Host "----------------------------------------"
    
    Set-Location $BACKEND_DIR
    
    # Create virtual environment if it doesn't exist
    if (-not (Test-Path ".venv")) {
        Write-Host "Creating Python virtual environment..."
        py -m venv .venv
    } else {
        Write-Host "Virtual environment already exists."
    }
    
    # Activate virtual environment
    & .\.venv\Scripts\Activate.ps1
    
    # Install requirements
    Write-Host "Installing Python dependencies..."
    pip install -r requirements.txt
    
    Write-Host "$GREEN Backend setup complete!$NC"
    Write-Host ""
}

# =============================================================================
# RUN FRONTEND
# =============================================================================
function Start-Frontend {
    Write-Host "$YELLOW Starting Frontend...$NC"
    Write-Host "----------------------------------------"
    Write-Host "$BLUE Frontend will be available at:$NC http://localhost:5173"
    Write-Host ""
    
    Set-Location $FRONTEND_DIR
    npm run dev
}

# =============================================================================
# RUN BACKEND
# =============================================================================
function Start-Backend {
    Write-Host "$YELLOW Starting Backend...$NC"
    Write-Host "----------------------------------------"
    Write-Host "$BLUE API will be available at:$NC http://localhost:8000"
    Write-Host "$BLUE API docs at:$NC http://localhost:8000/docs"
    Write-Host ""
    
    Set-Location $BACKEND_DIR
    
    # Activate virtual environment
    & .\.venv\Scripts\Activate.ps1
    
    # Check if .env exists
    if (-not (Test-Path ".env")) {
        Write-Host "$YELLOW Warning: .env file not found in backend directory$NC"
        Write-Host "Creating example .env file..."
        @"
# Kafka Configuration
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_CLIENT_ID=rupeewise-backend

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Integration URLs
INTEGRATIONS_API_KEY=your_api_key
GEMINI_URL=https://your-gateway-url.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse
OCR_URL=https://your-gateway-url.com/parse/image

# Kafka Topics
TOPIC_CHAT_REQUESTS=chat_requests
TOPIC_CHAT_RESPONSES=chat_responses
TOPIC_BUDGET_REQUESTS=budget_requests
TOPIC_BUDGET_RESPONSES=budget_responses
TOPIC_OCR_REQUESTS=ocr_requests
TOPIC_OCR_RESPONSES=ocr_responses
TOPIC_TRANSACTIONS=transactions
TOPIC_NOTIFICATIONS=notifications
TOPIC_ANALYTICS=analytics
"@ | Out-File -FilePath ".env" -Encoding utf8
        
        Write-Host "$YELLOW Please edit .env file with your actual configuration$NC"
    }
    
    # Start API server
    python -m backend.api
}

# =============================================================================
# RUN PROCESSOR
# =============================================================================
function Start-Processor {
    Write-Host "$YELLOW Starting Pathway Processor...$NC"
    Write-Host "----------------------------------------"
    Write-Host "$BLUE Processor consumes from Kafka topics$NC"
    Write-Host ""
    
    Set-Location $BACKEND_DIR
    
    # Activate virtual environment
    & .\.venv\Scripts\Activate.ps1
    
    # Start processor
    python -m backend.processor
}

# =============================================================================
# SHOW HELP
# =============================================================================
function Show-Help {
    Write-Host "$BLUE Usage:$NC .\hackathon-setup.ps1 [option]"
    Write-Host ""
    Write-Host "$BLUE Options:$NC"
    Write-Host "  all         - Install all dependencies (frontend + backend)"
    Write-Host "  frontend     - Setup and run frontend only"
    Write-Host "  backend      - Setup and run backend API only"
    Write-Host "  processor    - Setup and run Kafka processor only"
    Write-Host "  install      - Install all dependencies only"
    Write-Host "  menu         - Show this menu"
    Write-Host ""
    Write-Host "$BLUE Note:$NC Kafka must be running separately on localhost:9092"
}

# =============================================================================
# MAIN MENU
# =============================================================================
function Show-Menu {
    Write-Host "$BLUE Available Commands:$NC"
    Write-Host "  all         - Install all dependencies"
    Write-Host "  frontend    - Run frontend (React + Vite)"
    Write-Host "  backend     - Run backend API (FastAPI)"
    Write-Host "  processor   - Run Kafka processor"
    Write-Host "  install     - Install all dependencies"
    Write-Host "  help        - Show help"
    Write-Host ""
    Write-Host "$YELLOW Example:$NC .\hackathon-setup.ps1 install"
}

# Main execution
switch ($Command.ToLower()) {
    "all" {
        Test-Prerequisites
        Install-Frontend
        Install-Backend
        Write-Host "$GREEN========================================$NC"
        Write-Host "$GREEN  Installation complete!$NC"
        Write-Host "$GREEN========================================$NC"
        Write-Host ""
        Write-Host "$YELLOW To run in separate terminals:$NC"
        Write-Host "  Terminal 1: .\hackathon-setup.ps1 frontend"
        Write-Host "  Terminal 2: .\hackathon-setup.ps1 backend"
        Write-Host "  Terminal 3: .\hackathon-setup.ps1 processor"
    }
    "frontend" {
        Test-Prerequisites
        Install-Frontend
        Start-Frontend
    }
    "backend" {
        Test-Prerequisites
        Install-Backend
        Start-Backend
    }
    "processor" {
        Test-Prerequisites
        Install-Backend
        Start-Processor
    }
    "install" {
        Test-Prerequisites
        Install-Frontend
        Install-Backend
        Write-Host "$GREEN All dependencies installed!$NC"
    }
    "menu" {
        Test-Prerequisites
        Show-Menu
    }
    "help" {
        Show-Help
    }
    default {
        Test-Prerequisites
        Write-Host "$RED Unknown option: $Command$NC"
        Show-Menu
        exit 1
    }
}
