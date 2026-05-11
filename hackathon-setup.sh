#!/bin/bash

# =============================================================================
# HACKATHON SETUP SCRIPT
# =============================================================================
# This script sets up and runs the entire project for hackathon demos
# 
# Project Structure:
# - Frontend: React + Vite + TypeScript + Supabase (Port 5173)
# - Backend: FastAPI + Kafka + Pathway Engine (Port 8000)
# - Kafka: Required for message processing (localhost:9092)
#
# Usage:
#   ./hackathon-setup.sh        # Interactive mode
#   ./hackathon-setup.sh all    # Run everything
#   ./hackathon-setup.sh frontend  # Frontend only
#   ./hackathon-setup.sh backend  # Backend only
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR"
BACKEND_DIR="$SCRIPT_DIR/services/backend"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  HACKATHON PROJECT SETUP SCRIPT${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# =============================================================================
# CHECK PREREQUISITES
# =============================================================================
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        echo -e "${GREEN}✓${NC} Node.js: $NODE_VERSION"
    else
        echo -e "${RED}✗${NC} Node.js not found. Please install Node.js 20+"
        exit 1
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        echo -e "${GREEN}✓${NC} npm: $NPM_VERSION"
    else
        echo -e "${RED}✗${NC} npm not found. Please install npm"
        exit 1
    fi
    
    # Check Python
    if command -v python &> /dev/null; then
        PYTHON_VERSION=$(python --version)
        echo -e "${GREEN}✓${NC} Python: $PYTHON_VERSION"
    elif command -v py &> /dev/null; then
        PYTHON_VERSION=$(py --version)
        echo -e "${GREEN}✓${NC} Python: $PYTHON_VERSION"
    else
        echo -e "${RED}✗${NC} Python not found. Please install Python 3.11+"
        exit 1
    fi
    
    echo -e "${GREEN}All prerequisites satisfied!${NC}"
    echo ""
}

# =============================================================================
# SETUP FRONTEND
# =============================================================================
setup_frontend() {
    echo -e "${YELLOW}Setting up Frontend...${NC}"
    echo "----------------------------------------"
    
    cd "$FRONTEND_DIR"
    
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        echo "Installing frontend dependencies..."
        npm install
    else
        echo "Frontend dependencies already installed."
    fi
    
    echo -e "${GREEN}Frontend setup complete!${NC}"
    echo ""
}

# =============================================================================
# SETUP BACKEND
# =============================================================================
setup_backend() {
    echo -e "${YELLOW}Setting up Backend...${NC}"
    echo "----------------------------------------"
    
    cd "$BACKEND_DIR"
    
    # Create virtual environment if it doesn't exist
    if [ ! -d ".venv" ]; then
        echo "Creating Python virtual environment..."
        python -m venv .venv
    else
        echo "Virtual environment already exists."
    fi
    
    # Activate virtual environment
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        source .venv/Scripts/activate
    else
        source .venv/bin/activate
    fi
    
    # Install requirements
    echo "Installing Python dependencies..."
    pip install -r requirements.txt
    
    echo -e "${GREEN}Backend setup complete!${NC}"
    echo ""
}

# =============================================================================
# RUN FRONTEND
# =============================================================================
run_frontend() {
    echo -e "${YELLOW}Starting Frontend...${NC}"
    echo "----------------------------------------"
    echo -e "${BLUE}Frontend will be available at:${NC} http://localhost:5173"
    echo ""
    
    cd "$FRONTEND_DIR"
    npm run dev
}

# =============================================================================
# RUN BACKEND
# =============================================================================
run_backend() {
    echo -e "${YELLOW}Starting Backend...${NC}"
    echo "----------------------------------------"
    echo -e "${BLUE}API will be available at:${NC} http://localhost:8000"
    echo -e "${BLUE}API docs at:${NC} http://localhost:8000/docs"
    echo ""
    
    cd "$BACKEND_DIR"
    
    # Activate virtual environment
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        source .venv/Scripts/activate
    else
        source .venv/bin/activate
    fi
    
    # Check if .env exists
    if [ ! -f ".env" ]; then
        echo -e "${YELLOW}Warning: .env file not found in backend directory${NC}"
        echo "Creating example .env file..."
        cat > .env << 'EOF'
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
EOF
        echo -e "${YELLOW}Please edit .env file with your actual configuration${NC}"
    fi
    
    # Start API server
    python -m backend.api
}

# =============================================================================
# RUN PROCESSOR
# =============================================================================
run_processor() {
    echo -e "${YELLOW}Starting Pathway Processor...${NC}"
    echo "----------------------------------------"
    echo -e "${BLUE}Processor consumes from Kafka topics${NC}"
    echo ""
    
    cd "$BACKEND_DIR"
    
    # Activate virtual environment
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        source .venv/Scripts/activate
    else
        source .venv/bin/activate
    fi
    
    # Start processor
    python -m backend.processor
}

# =============================================================================
# MAIN MENU
# =============================================================================
show_help() {
    echo -e "${BLUE}Usage:${NC} $0 [option]"
    echo ""
    echo -e "${BLUE}Options:${NC}"
    echo "  all         - Run both frontend and backend"
    echo "  frontend    - Setup and run frontend only"
    echo "  backend     - Setup and run backend API only"
    echo "  processor   - Setup and run Kafka processor only"
    echo "  install     - Install all dependencies only"
    echo "  help        - Show this help message"
    echo ""
    echo -e "${BLUE}Note:${NC} Kafka must be running separately on localhost:9092"
}

# Main execution
case "${1:-help}" in
    all)
        check_prerequisites
        setup_frontend
        setup_backend
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}  Starting all services...${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo ""
        echo -e "${YELLOW}To run in separate terminals:${NC}"
        echo "  Terminal 1: ./hackathon-setup.sh frontend"
        echo "  Terminal 2: ./hackathon-setup.sh backend"
        echo "  Terminal 3: ./hackathon-setup.sh processor"
        ;;
    frontend)
        check_prerequisites
        setup_frontend
        run_frontend
        ;;
    backend)
        check_prerequisites
        setup_backend
        run_backend
        ;;
    processor)
        check_prerequisites
        setup_backend
        run_processor
        ;;
    install)
        check_prerequisites
        setup_frontend
        setup_backend
        echo -e "${GREEN}All dependencies installed!${NC}"
        ;;
    help|--help|-h)
        check_prerequisites
        show_help
        ;;
    *)
        echo -e "${RED}Unknown option: $1${NC}"
        show_help
        exit 1
        ;;
esac
