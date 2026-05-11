


## Project Info

## Project Directory

```
├── README.md # Documentation
├── components.json # Component library configuration
├── index.html # Entry file
├── package.json # Package management
├── postcss.config.js # PostCSS configuration
├── public # Static resources directory
│   ├── favicon.png # Icon
│   └── images # Image resources
├── src # Source code directory
│   ├── App.tsx # Entry file
│   ├── components # Components directory
│   ├── context # Context directory
│   ├── db # Database configuration directory
│   ├── hooks # Common hooks directory
│   ├── index.css # Global styles
│   ├── layout # Layout directory
│   ├── lib # Utility library directory
│   ├── main.tsx # Entry file
│   ├── routes.tsx # Routing configuration
│   ├── pages # Pages directory
│   ├── services # Database interaction directory
│   ├── types # Type definitions directory
├── tsconfig.app.json # TypeScript frontend configuration file
├── tsconfig.json # TypeScript configuration file
├── tsconfig.node.json # TypeScript Node.js configuration file
└── vite.config.ts # Vite configuration file
```

## Tech Stack

Vite, TypeScript, React, Supabase

## Development Guidelines

### How to edit code locally?

You can choose [VSCode](https://code.visualstudio.com/Download) or any IDE you prefer. The only requirement is to have Node.js and npm installed.

### Environment Requirements

```
# Node.js ≥ 20
# npm ≥ 10
Example:
# node -v   # v20.18.3
# npm -v    # 10.8.2
```

### Installing Node.js on Windows

```
# Step 1: Visit the Node.js official website: https://nodejs.org/, click download. The website will automatically suggest a suitable version (32-bit or 64-bit) for your system.
# Step 2: Run the installer: Double-click the downloaded installer to run it.
# Step 3: Complete the installation: Follow the installation wizard to complete the process.
# Step 4: Verify installation: Open Command Prompt (cmd) or your IDE terminal, and type `node -v` and `npm -v` to check if Node.js and npm are installed correctly.
```

### Installing Node.js on macOS

```
# Step 1: Using Homebrew (Recommended method): Open Terminal. Type the command `brew install node` and press Enter. If Homebrew is not installed, you need to install it first by running the following command in Terminal:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
Alternatively, use the official installer: Visit the Node.js official website. Download the macOS .pkg installer. Open the downloaded .pkg file and follow the prompts to complete the installation.
# Step 2: Verify installation: Open Command Prompt (cmd) or your IDE terminal, and type `node -v` and `npm -v` to check if Node.js and npm are installed correctly.
```

### After installation, follow these steps:

```
# Step 1: Download the code package
# Step 2: Extract the code package
# Step 3: Open the code package with your IDE and navigate into the code directory
# Step 4: In the IDE terminal, run the command to install dependencies: npm i
# Step 5: In the IDE terminal, run the command to start the development server: npm run dev -- --host 127.0.0.1
# Step 6: if step 5 failed, try this command to start the development server: npx vite --host 127.0.0.1
```

### How to develop backend services?

Configure environment variables and install relevant dependencies.If you need to use a database, please use the official version of Supabase.

# Task: Build RAG-Driven Personal & Family Finance Assistant

## Plan
- [x] Phase 1: Database & Backend Setup
- [x] Phase 2: Design System & Core Infrastructure
- [x] Phase 3: Layout & Navigation
- [x] Phase 4: Core Pages & Features
- [x] Phase 5: Components & Features
- [x] Phase 6: AI Integration & RAG
- [x] Phase 7: Validation & Polish
- [x] Phase 8: Enhancements
  - [x] Convert all currency to Indian Rupees (₹)
  - [x] Add AI-powered budget design from uploaded documents
  - [x] Add manual expense tracking with sliders in Dashboard
  - [x] Add manual expense input dialog
  - [x] Implement real-time calculations for remaining balance and budget usage
  - [x] Perfect all financial calculations
  - [x] Deploy all updated Edge Functions
  - [x] Replace all dollar icons with Indian Rupee icons throughout the website
- [x] Phase 9: Payment App Integration
  - [x] Create demo Payment App with Google Pay-like interface
  - [x] Add 15 default merchants across all categories
  - [x] Implement payment processing with real-time transaction creation
  - [x] Add "Pay Now" button to Transactions page
  - [x] Add "Quick Pay" button to Dashboard
  - [x] Integrate payment app with transaction history
  - [x] Ensure all numbers update across website after payment
  - [x] Enable chatbot to read payment transactions
- [x] Phase 10: Landing Page
  - [x] Create comprehensive landing page with all required sections
  - [x] Add Hero section with headline, subheading, and key highlights
  - [x] Add Problem Statement section explaining pain points
  - [x] Add Solution section with visual elements
  - [x] Add Key Features section with 6 detailed feature cards
  - [x] Add How It Works section with 5-step process
  - [x] Add Trust & Privacy section with security highlights
  - [x] Add Final CTA section
  - [x] Add comprehensive Footer with Product, Company, Legal, and Social links
  - [x] Add Sign In and Sign Up buttons in navigation
  - [x] Configure routing to make Landing page the default
  - [x] Update RouteGuard to allow public access to landing page
- [x] Phase 11: Modern UI Redesign
  - [x] Update design system with vibrant gradient colors (purple, pink, blue, orange)
  - [x] Increase border radius to 1rem for modern rounded look
  - [x] Add gradient background utilities (gradient-bg-1, gradient-bg-2, gradient-bg-3)
  - [x] Add glass-effect utility for glassmorphism design
  - [x] Add floating-card utility with hover animations
  - [x] Create FloatingSidebarLayout with elevated, futuristic sidebar
  - [x] Implement floating sidebar with glassmorphism effect
  - [x] Add gradient logo icon in sidebar
  - [x] Add active state indicators with gradient backgrounds
  - [x] Update Landing page with gradient hero section
  - [x] Add glass-effect navigation bar
  - [x] Update Dashboard cards with floating design and gradient icon backgrounds
  - [x] Add smooth scroll behavior
  - [x] Implement mobile bottom navigation for responsive design
- [x] Phase 12: Mobile UI Optimization
  - [x] Fix Chat page input box overshadowed by mobile navigation
  - [x] Add proper padding-bottom (pb-20) for mobile nav on all pages
  - [x] Update Chat page height calculation for mobile (h-[calc(100vh-8rem)])
  - [x] Improve mobile bottom navigation with gradient active states
  - [x] Add responsive text sizes (text-2xl md:text-3xl) for all page headers
  - [x] Update all cards with floating-card class and shadow-lg
  - [x] Add rounded-full buttons for modern mobile appearance
  - [x] Fix Dashboard header layout for mobile (flex-col sm:flex-row)
  - [x] Fix Transactions page filter dropdown for mobile (full width on mobile)
  - [x] Update all page containers to remove fixed padding
  - [x] Add responsive spacing (p-4 md:p-6) throughout
  - [x] Improve chat message bubbles with gradient backgrounds
  - [x] Add backdrop blur to chat input area for better visibility
  - [x] Fix mobile navigation icon sizes and spacing
  - [x] Ensure all interactive elements are touch-friendly (min 44px)
  - [x] Update landing page hero heading to "Your personal AI budget planner"
  - [x] Add mobile hamburger menu in top right corner
  - [x] Implement Sheet component for mobile menu drawer
  - [x] Add Account (Settings), Transactions, and Sign Out options to mobile menu
  - [x] Add RupeeWise logo to mobile header
  - [x] Update Chat page height to account for mobile header (h-[calc(100vh-12rem)])
  - [x] Add pt-16 to main content area for mobile header clearance
- [x] Phase 13: Clear Chat Feature & Design System Update
  - [x] Add Clear Chat button to Chat page header
  - [x] Implement AlertDialog for clear chat confirmation
  - [x] Add clearChatHistory function integration
  - [x] Add toast notifications for clear chat success/error
  - [x] Update color scheme to match uploaded design images
  - [x] Change primary color to #E62DA9 (bright pink/magenta)
  - [x] Change secondary color to #FEDC85 (yellow/gold)
  - [x] Update background colors with subtle purple tint
  - [x] Update foreground to #0D0C10 (near black)
  - [x] Update typography to SF Pro Display font family
  - [x] Add font smoothing and letter spacing
  - [x] Update gradient utilities with new color scheme
  - [x] Update glass-effect with better opacity
  - [x] Update floating-card shadows with pink tint
  - [x] Update Login page with new design (rounded-3xl logo, gradient buttons)
  - [x] Add gradient background to Login page
  - [x] Update all input fields with rounded-2xl
  - [x] Update all buttons with rounded-full
  - [x] Ensure proper contrast for all text elements
- [x] Phase 14: Markdown Rendering for Chat Responses
  - [x] Install react-markdown and remark-gfm packages
  - [x] Install @tailwindcss/typography plugin
  - [x] Add typography plugin to tailwind.config.js
  - [x] Update Chat page to use ReactMarkdown for bot messages
  - [x] Add custom prose styles for markdown rendering
  - [x] Ensure bold text (**text**) renders properly with font-weight: 700
  - [x] Style strong tags with foreground color for visibility
  - [x] Add proper spacing for paragraphs, lists, and headings
  - [x] Style code blocks with muted background
  - [x] Apply markdown rendering to both saved and streaming messages
  - [x] Keep user messages as plain text (no markdown rendering)
  - [x] Fix mobile text cutoff issue
  - [x] Change max-width to calc(100%-3rem) on mobile to account for avatar
  - [x] Add break-words and overflow-hidden to chat bubbles
  - [x] Add word-wrap and overflow-wrap to all prose elements
  - [x] Ensure proper text wrapping for long words and URLs
  - [x] Add overflow-x: auto for code blocks and tables
- [x] Phase 15: Production-Level RAG Enhancement
  - [x] Add query intent detection (spending_query, budget_creation, budget_analysis, savings_query, anomaly_detection)
  - [x] Add financial keyword extraction from user queries
  - [x] Add category detection (groceries, rent, transport, entertainment, etc.)
  - [x] Add timeframe detection (today, week, month, year)
  - [x] Implement dynamic context retrieval based on query analysis
  - [x] Add relevance scoring for transaction filtering
  - [x] Increase transaction limit to 100 for category-specific queries
  - [x] Add time-based transaction filtering
  - [x] Calculate spending trends (average daily spending over 30 days)
  - [x] Implement anomaly detection using statistical analysis (mean + 2 std dev)
  - [x] Add comprehensive budget vs actual analysis with status indicators
  - [x] Calculate percentage used for each budget category
  - [x] Add status indicators (over, warning, good) for budget categories
  - [x] Include uploaded document count in context
  - [x] Implement sliding window for chat history (last 20 messages, use 10)
  - [x] Enhance system prompt with structured financial data
  - [x] Add emoji indicators for budget status (🔴 over, ⚠️ warning, ✅ good)
  - [x] Format budget analysis with clear breakdowns
  - [x] Include unusual transaction detection in context
  - [x] Add query analysis feedback in system prompt
  - [x] Improve OCR document metadata extraction
  - [x] Add document processing timestamp
  - [x] Add text length metadata for documents
  - [x] Enhance transaction parsing prompt with detailed instructions
  - [x] Add category descriptions for better AI categorization
  - [x] Improve date parsing logic with year inference
  - [x] Add merchant name extraction guidelines
  - [x] Deploy enhanced gemini-chat Edge Function
  - [x] Deploy enhanced ocr-process Edge Function
- [x] Phase 16: Pathway-Inspired Real-time Processing Framework
  - [x] Create real-time data processing module (realtime-processor.ts)
  - [x] Implement TransactionPipeline for real-time transaction monitoring
  - [x] Add real-time anomaly detection with statistical analysis
  - [x] Implement severity levels (low, medium, high) for anomalies
  - [x] Add real-time budget monitoring and alerts
  - [x] Implement BudgetMonitoringPipeline for budget changes
  - [x] Create DocumentProcessingPipeline for document status tracking
  - [x] Build RealtimeProcessingManager to coordinate all pipelines
  - [x] Implement Supabase Realtime subscriptions for data changes
  - [x] Add automatic anomaly detection on new transactions
  - [x] Add automatic budget alerts at 80% and 100% thresholds
  - [x] Create RealtimeContext for app-wide real-time processing
  - [x] Integrate RealtimeProvider into App.tsx
  - [x] Add toast notifications for anomalies and budget alerts
  - [x] Implement automatic cleanup on user logout
  - [x] Add document processing completion notifications
  - [x] Track recent anomalies (last 10) in context
  - [x] Track recent alerts (last 10) in context
  - [x] Implement streaming data pipeline architecture
  - [x] Add real-time statistics updates
  - [x] Enable production-ready real-time monitoring

## Notes
- All currency now displayed in Indian Rupees (₹)
- OCR processing now automatically suggests budgets based on spending patterns
- **Pathway-Inspired Real-time Processing Framework**:
  - **Architecture**: Streaming data pipeline system inspired by Pathway framework patterns
  - **TransactionPipeline**: Real-time monitoring of all new transactions with automatic processing
  - **Anomaly Detection**: Statistical analysis (Z-score) to detect unusual spending patterns
    * High severity: >3 standard deviations from mean (immediate alert)
    * Medium severity: >2 standard deviations (warning notification)
    * Automatic toast notifications for unusual transactions
  - **Budget Monitoring**: Real-time budget tracking with automatic alerts
    * Warning at 80% budget usage
    * Alert at 100% budget exceeded
    * Category-specific monitoring for all 12 budget categories
  - **Document Processing**: Real-time tracking of document upload and OCR processing
    * Automatic notifications when documents are processed
    * Transaction extraction completion alerts
  - **Supabase Realtime**: Leverages Supabase real-time subscriptions for instant updates
  - **RealtimeContext**: App-wide context for accessing real-time processing features
  - **Automatic Cleanup**: Pipelines automatically stop on user logout
  - **Production-Ready**: Optimized for performance and scalability
- Production-Level RAG (Retrieval-Augmented Generation) System:
  - **Query Intelligence**: Automatic intent detection (spending queries, budget analysis, savings, anomaly detection)
  - **Smart Context Retrieval**: Dynamic transaction filtering based on detected categories and timeframes
  - **Financial Keyword Extraction**: Identifies categories (groceries, rent, transport, etc.) and time periods (today, week, month, year)
  - **Relevance Scoring**: Prioritizes most relevant transactions for each query
  - **Spending Trends**: Calculates average daily spending over 30-day rolling window
  - **Anomaly Detection**: Statistical analysis (mean + 2 standard deviations) to identify unusual transactions
  - **Budget Analysis**: Real-time budget vs actual comparison with status indicators (🔴 over, ⚠️ warning, ✅ good)
  - **Sliding Window Context**: Maintains last 20 chat messages, uses most recent 10 for context
  - **Document Indexing**: Tracks uploaded documents with metadata (text length, processing timestamp)
  - **Enhanced Prompts**: Structured system prompts with comprehensive financial data formatting
  - **Markdown Responses**: AI responses use bold text for key numbers and insights
  - **Production-Ready**: Optimized for accuracy, performance, and scalability
- Dashboard enhanced with:
  - Sliders for each budget category to track additional spending
  - Manual expense input dialog with category selection
  - Real-time updates to remaining balance and budget usage
  - Color-coded budget usage indicators (green < 80%, yellow 80-100%, red > 100%)
- Payment App features:
  - Google Pay-like interface with modern design
  - 15 default merchants (Big Bazaar, DMart, Swiggy, Zomato, Uber, Ola, etc.)
  - Instant payment processing with confirmation dialogs
  - Real-time transaction creation and budget updates
  - Accessible from Dashboard (Quick Pay) and Transactions page (Pay Now)
  - All payments automatically categorized and visible in transaction history
  - Chatbot can read and analyze all payment transactions
- Landing Page features:
  - Modern fintech aesthetic with clean design
  - Comprehensive Hero section with "Built for India 🇮🇳" badge
  - Problem Statement section addressing Indian user pain points
  - Solution section explaining the platform approach
  - 6 detailed feature cards with highlights
  - 5-step "How It Works" process
  - Trust & Privacy section with security guarantees
  - Disclaimer about budgeting-only insights
  - Full footer with Product, Company, Legal, and Social sections
  - Sign In and Sign Up buttons in sticky navigation
  - Smooth scroll animations and responsive design
  - Public access without login requirement
- Modern UI Design:
  - Color Scheme (Based on uploaded images):
    * Primary Pink: #E62DA9 (HSL: 322 82% 57%) - Bright magenta for primary actions
    * Secondary Yellow: #FEDC85 (HSL: 40 99% 76%) - Gold/yellow for accents
    * Background: Light with subtle purple tint (HSL: 245 25% 97%)
    * Foreground: Near black #0D0C10 (HSL: 260 10% 5%)
    * White: #FFFFFF for cards and clean surfaces
  - Typography: SF Pro Display font family with fallbacks
  - Font smoothing and letter spacing for crisp rendering
  - Border radius: 1.5rem (24px) for modern rounded look
  - Pink-tinted shadows for depth (rgba(230, 45, 169, 0.12))
  - Glassmorphism effects with 85% opacity and 12px blur
  - Floating sidebar navigation with elevated design
  - Gradient icon backgrounds in cards
  - Smooth hover animations and transitions
  - Mobile-responsive bottom navigation
  - Active state indicators with gradients
  - Modern card designs with floating effect
  - Rounded-full buttons for modern appearance
  - Proper contrast ratios for accessibility (WCAG AA compliant)
- Chat Features:
  - Clear Chat button with confirmation dialog
  - Permanently deletes all chat history for the user
  - Toast notifications for success/error feedback
  - Button disabled when no messages or clearing in progress
  - Mobile-responsive (icon only on small screens)
  - Markdown rendering for bot responses:
    * Bold text with **text** renders properly with font-weight: 700
    * Italic text with *text* renders in italics
    * Code blocks with proper syntax highlighting
    * Lists (ordered and unordered) with proper formatting
    * Headings with appropriate sizes and weights
    * Links are clickable and styled
    * All markdown features supported via react-markdown and remark-gfm
    * User messages remain as plain text (no markdown rendering)
- Mobile Optimization:
  - Fixed chat input box being overshadowed by mobile nav
  - Added proper bottom padding (pb-20 lg:pb-6) for mobile navigation
  - Responsive text sizes throughout (text-2xl md:text-3xl for headers)
  - Mobile-first layout adjustments (flex-col sm:flex-row)
  - Full-width dropdowns and inputs on mobile
  - Touch-friendly button sizes (minimum 44px tap targets)
  - Gradient active states in mobile bottom navigation
  - Backdrop blur on fixed elements for better visibility
  - Responsive spacing (p-4 md:p-6) across all pages
  - Improved chat bubbles with gradient backgrounds and rounded corners
  - All cards updated with floating-card class for consistent design
  - Rounded-full buttons for modern mobile appearance
  - Mobile hamburger menu with Account, Transactions, and Sign Out options
  - Fixed mobile header with RupeeWise logo and glassmorphism effect
  - Sheet drawer component for smooth mobile menu experience
  - Proper top padding (pt-16) for mobile header clearance
- All calculations are accurate and update in real-time
- Existing functionalities, UI design, and chat features preserved
- All Edge Functions updated and redeployed
