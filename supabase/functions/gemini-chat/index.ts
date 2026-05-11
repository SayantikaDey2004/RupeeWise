import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatRequest {
  message: string;
  userId: string;
  localContext?: Record<string, unknown>;
  localHistory?: Array<{
    role: 'user' | 'model';
    message: string;
  }>;
}

// Enhanced RAG: Relevance scoring for context retrieval
function calculateRelevanceScore(query: string, text: string): number {
  const queryWords = query.toLowerCase().split(/\s+/);
  const textWords = text.toLowerCase().split(/\s+/);
  let score = 0;
  
  for (const qWord of queryWords) {
    if (qWord.length < 3) continue; // Skip short words
    for (const tWord of textWords) {
      if (tWord.includes(qWord) || qWord.includes(tWord)) {
        score += 1;
      }
    }
  }
  
  return score;
}

// Enhanced RAG: Extract financial keywords from query
function extractFinancialKeywords(query: string): {
  categories: string[];
  timeframe: string | null;
  intent: string;
} {
  const lowerQuery = query.toLowerCase();
  
  // Category detection
  const categoryMap: Record<string, string[]> = {
    'groceries': ['grocery', 'groceries', 'food', 'supermarket'],
    'rent': ['rent', 'housing', 'apartment'],
    'transport': ['transport', 'uber', 'ola', 'taxi', 'petrol', 'fuel', 'car'],
    'entertainment': ['entertainment', 'movie', 'netflix', 'spotify', 'game'],
    'dining': ['dining', 'restaurant', 'zomato', 'swiggy', 'food delivery'],
    'shopping': ['shopping', 'amazon', 'flipkart', 'clothes', 'electronics'],
    'utilities': ['utilities', 'electricity', 'water', 'internet', 'phone'],
    'healthcare': ['healthcare', 'medical', 'doctor', 'hospital', 'medicine'],
    'education': ['education', 'course', 'book', 'tuition', 'school'],
    'savings': ['savings', 'save', 'saving'],
    'emergency_fund': ['emergency', 'emergency fund']
  };
  
  const detectedCategories: string[] = [];
  for (const [category, keywords] of Object.entries(categoryMap)) {
    if (keywords.some(kw => lowerQuery.includes(kw))) {
      detectedCategories.push(category);
    }
  }
  
  // Timeframe detection
  let timeframe: string | null = null;
  if (lowerQuery.includes('today')) timeframe = 'today';
  else if (lowerQuery.includes('this week') || lowerQuery.includes('week')) timeframe = 'week';
  else if (lowerQuery.includes('this month') || lowerQuery.includes('month')) timeframe = 'month';
  else if (lowerQuery.includes('this year') || lowerQuery.includes('year')) timeframe = 'year';
  
  // Intent detection
  let intent = 'general';
  if (lowerQuery.includes('how much') || lowerQuery.includes('spent') || lowerQuery.includes('spending')) {
    intent = 'spending_query';
  } else if (lowerQuery.includes('budget') && (lowerQuery.includes('create') || lowerQuery.includes('suggest'))) {
    intent = 'budget_creation';
  } else if (lowerQuery.includes('overspend') || lowerQuery.includes('over budget')) {
    intent = 'budget_analysis';
  } else if (lowerQuery.includes('save') || lowerQuery.includes('saving')) {
    intent = 'savings_query';
  } else if (lowerQuery.includes('unusual') || lowerQuery.includes('anomaly')) {
    intent = 'anomaly_detection';
  }
  
  return { categories: detectedCategories, timeframe, intent };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, userId }: ChatRequest = await req.json();

    if (!message || !userId) {
      return new Response(
        JSON.stringify({ error: 'Message and userId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Enhanced RAG: Extract query intent and keywords
    const queryAnalysis = extractFinancialKeywords(message);
    
    // Enhanced RAG: Dynamic context retrieval based on query
    let transactionLimit = 50;
    let transactionFilter = {};
    
    if (queryAnalysis.categories.length > 0) {
      // If specific categories mentioned, retrieve more transactions from those categories
      transactionLimit = 100;
    }
    
    // Retrieve user context for RAG with enhanced filtering
    const [
      { data: profile },
      { data: incomes },
      { data: budgets },
      { data: allTransactions },
      { data: chatHistory },
      { data: documents }
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('income_records').select('*').eq('user_id', userId),
      supabase.from('budgets').select('*').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: false }).limit(1),
      supabase.from('transactions').select('*').eq('user_id', userId).order('transaction_date', { ascending: false }).limit(transactionLimit),
      supabase.from('chat_history').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
      supabase.from('documents').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10)
    ]);

    // Enhanced RAG: Filter transactions by relevance
    let relevantTransactions = allTransactions || [];
    if (queryAnalysis.categories.length > 0) {
      relevantTransactions = relevantTransactions.filter(t => 
        queryAnalysis.categories.includes(t.category)
      );
    }
    
    // Enhanced RAG: Time-based filtering
    if (queryAnalysis.timeframe) {
      const now = new Date();
      let startDate: Date;
      
      switch (queryAnalysis.timeframe) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(0);
      }
      
      relevantTransactions = relevantTransactions.filter(t => 
        new Date(t.transaction_date) >= startDate
      );
    }

    // Calculate spending by category (current month)
    const spendingByCategory: Record<string, number> = {};
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    allTransactions?.forEach((t) => {
      const transactionMonth = t.transaction_date.slice(0, 7);
      if (transactionMonth === currentMonth) {
        spendingByCategory[t.category] = (spendingByCategory[t.category] || 0) + parseFloat(t.amount);
      }
    });

    // Enhanced RAG: Calculate spending trends
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const recentSpending = allTransactions?.filter(t => t.transaction_date >= last30Days) || [];
    const avgDailySpending = recentSpending.length > 0 
      ? recentSpending.reduce((sum, t) => sum + parseFloat(t.amount), 0) / 30 
      : 0;

    // Enhanced RAG: Anomaly detection
    const anomalies: any[] = [];
    if (allTransactions && allTransactions.length > 10) {
      const amounts = allTransactions.map(t => parseFloat(t.amount));
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const stdDev = Math.sqrt(amounts.reduce((sq, n) => sq + Math.pow(n - avgAmount, 2), 0) / amounts.length);
      
      allTransactions.forEach(t => {
        const amount = parseFloat(t.amount);
        if (amount > avgAmount + 2 * stdDev) {
          anomalies.push({
            amount: t.amount,
            merchant: t.merchant,
            date: t.transaction_date,
            category: t.category
          });
        }
      });
    }

    // Calculate total income
    const totalIncome = incomes?.reduce((sum, inc) => sum + parseFloat(inc.amount), 0) || 0;

    // Enhanced RAG: Budget vs Actual analysis
    const budgetAnalysis: Record<string, any> = {};
    if (budgets && budgets[0]) {
      const budget = budgets[0];
      const categories = ['rent', 'groceries', 'transport', 'entertainment', 'dining', 'shopping', 'utilities', 'healthcare', 'education', 'savings', 'emergency_fund', 'other'];
      
      categories.forEach(cat => {
        const budgeted = parseFloat(budget[cat] || '0');
        const spent = spendingByCategory[cat] || 0;
        const remaining = budgeted - spent;
        const percentUsed = budgeted > 0 ? (spent / budgeted) * 100 : 0;
        
        budgetAnalysis[cat] = {
          budgeted,
          spent,
          remaining,
          percentUsed: percentUsed.toFixed(1),
          status: percentUsed > 100 ? 'over' : percentUsed > 80 ? 'warning' : 'good'
        };
      });
    }

    // Build enhanced context for RAG
    const context = {
      userMode: profile?.user_mode || 'personal',
      totalIncome,
      incomeRecords: incomes || [],
      activeBudget: budgets?.[0] || null,
      recentTransactions: relevantTransactions.slice(0, 15),
      allCategorySpending: spendingByCategory,
      totalSpentThisMonth: Object.values(spendingByCategory).reduce((a, b) => a + b, 0),
      avgDailySpending: avgDailySpending.toFixed(2),
      budgetAnalysis,
      anomalies: anomalies.slice(0, 5),
      documentCount: documents?.length || 0,
      queryIntent: queryAnalysis.intent,
      detectedCategories: queryAnalysis.categories,
      detectedTimeframe: queryAnalysis.timeframe
    };

    // Build conversation history with sliding window (last 10 messages)
    const conversationHistory = chatHistory?.slice(0, 10).reverse().map(h => ({
      role: h.role,
      parts: [{ text: h.message }]
    })) || [];

    // Enhanced system prompt with comprehensive context
    const systemPrompt = `You are a personal finance assistant powered by advanced RAG (Retrieval-Augmented Generation). You ONLY answer questions about personal finance, budgeting, expense tracking, and financial planning.

STRICT RULES:
1. If the user asks anything outside of personal finance (e.g., general knowledge, politics, entertainment, etc.), respond EXACTLY with: "I'm designed to assist only with personal finance, budgeting, and expense-tracking questions."
2. NEVER provide investment guarantees, legal advice, or tax evasion strategies.
3. Base your answers ONLY on the provided user data. Do NOT guess or hallucinate numbers.
4. Be helpful, informative, and neutral in tone.
5. All currency amounts are in Indian Rupees (₹).
6. Use **bold text** for important numbers and key insights.
7. Provide actionable insights when relevant.

USER FINANCIAL PROFILE:
- **Mode**: ${context.userMode}
- **Total Monthly Income**: ₹${totalIncome.toFixed(2)}
- **Total Spent This Month**: ₹${context.totalSpentThisMonth.toFixed(2)}
- **Average Daily Spending (Last 30 Days)**: ₹${context.avgDailySpending}
- **Active Budget**: ${context.activeBudget ? '✓ Yes' : '✗ No'}
- **Uploaded Documents**: ${context.documentCount}

${context.activeBudget ? `
BUDGET ALLOCATIONS & ANALYSIS:
${Object.entries(budgetAnalysis).map(([cat, data]: [string, any]) => {
  if (data.budgeted === 0) return '';
  const emoji = data.status === 'over' ? '🔴' : data.status === 'warning' ? '⚠️' : '✅';
  return `${emoji} **${cat.charAt(0).toUpperCase() + cat.slice(1)}**: Budgeted ₹${data.budgeted.toFixed(2)} | Spent ₹${data.spent.toFixed(2)} | Remaining ₹${data.remaining.toFixed(2)} (${data.percentUsed}% used)`;
}).filter(Boolean).join('\n')}
` : ''}

CURRENT MONTH SPENDING BY CATEGORY:
${Object.entries(spendingByCategory).map(([cat, amount]) => 
  `- **${cat.charAt(0).toUpperCase() + cat.slice(1)}**: ₹${amount.toFixed(2)}`
).join('\n') || '- No spending recorded yet'}

${anomalies.length > 0 ? `
⚠️ UNUSUAL TRANSACTIONS DETECTED:
${anomalies.map(a => 
  `- ₹${a.amount} at ${a.merchant} on ${a.date} (${a.category})`
).join('\n')}
` : ''}

RECENT RELEVANT TRANSACTIONS (Last ${relevantTransactions.length}):
${context.recentTransactions.map(t => 
  `- ₹${t.amount} | ${t.merchant} | ${t.category} | ${t.transaction_date}`
).join('\n') || '- No transactions yet'}

${queryAnalysis.intent !== 'general' ? `
QUERY ANALYSIS:
- **Detected Intent**: ${queryAnalysis.intent}
- **Detected Categories**: ${queryAnalysis.categories.join(', ') || 'None'}
- **Detected Timeframe**: ${queryAnalysis.timeframe || 'Not specified'}
` : ''}

Answer the user's question based on this comprehensive financial data. Always use ₹ (Indian Rupees) for currency amounts. Provide specific numbers and actionable insights.`;

    // Prepare Gemini API request
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent';

    const geminiRequest = {
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'I understand. I will only answer personal finance questions based on the provided user data.' }] },
        ...conversationHistory,
        { role: 'user', parts: [{ text: message }] }
      ]
    };

    // Call Gemini API with streaming
    const geminiResponse = await fetch(`${geminiUrl}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(geminiRequest)
    });

    if (!geminiResponse.ok) {
      throw new Error(`Gemini API error: ${geminiResponse.statusText}`);
    }

    // Save user message to chat history
    await supabase.from('chat_history').insert({
      user_id: userId,
      role: 'user',
      message
    });

    // Stream response back to client
    const reader = geminiResponse.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let fullResponse = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data.trim()) {
                  try {
                    const parsed = JSON.parse(data);
                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                      fullResponse += text;
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                    }
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
              }
            }
          }

          // Save model response to chat history
          if (fullResponse) {
            await supabase.from('chat_history').insert({
              user_id: userId,
              role: 'model',
              message: fullResponse
            });
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    console.error('Error in gemini-chat:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
