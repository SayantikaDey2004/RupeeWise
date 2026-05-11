import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BudgetSuggestionRequest {
  userId: string;
  totalIncome: number;
  period: 'monthly' | 'yearly';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, totalIncome, period }: BudgetSuggestionRequest = await req.json();

    if (!userId || !totalIncome || !period) {
      return new Response(
        JSON.stringify({ error: 'userId, totalIncome, and period are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's past transactions for context
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false })
      .limit(100);

    // Calculate average spending by category
    const spendingByCategory: Record<string, number[]> = {};
    transactions?.forEach((t: any) => {
      if (!spendingByCategory[t.category]) {
        spendingByCategory[t.category] = [];
      }
      spendingByCategory[t.category].push(parseFloat(t.amount));
    });

    const avgSpending: Record<string, number> = {};
    Object.keys(spendingByCategory).forEach((category) => {
      const amounts = spendingByCategory[category];
      avgSpending[category] = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    });

    // Build prompt for Gemini
    const prompt = `You are a financial advisor. Create a ${period} budget plan for a user with total income of ₹${totalIncome}.

${transactions && transactions.length > 0 ? `The user's past spending patterns:
${JSON.stringify(avgSpending, null, 2)}` : 'No past spending data available.'}

Create a balanced budget allocation across these categories:
- rent
- groceries
- transport
- entertainment
- savings
- emergency_fund
- utilities
- healthcare
- education
- dining
- shopping
- other

Return ONLY a valid JSON object with this exact format:
{
  "rent": 1200.00,
  "groceries": 400.00,
  "transport": 200.00,
  "entertainment": 150.00,
  "savings": 500.00,
  "emergency_fund": 300.00,
  "utilities": 150.00,
  "healthcare": 100.00,
  "education": 100.00,
  "dining": 200.00,
  "shopping": 150.00,
  "other": 100.00
}

Ensure:
1. Total allocations do not exceed the total income
2. Prioritize savings (at least 20% of income)
3. Emergency fund should be at least 10% of income
4. Consider past spending patterns if available
5. All values must be positive numbers in Indian Rupees (₹)`;

    // Call Gemini API
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent';

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY is not set in function environment' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiRequest = {
      contents: [
        { role: 'user', parts: [{ text: prompt }] }
      ]
    };

    let geminiResponse: Response;
    try {
      geminiResponse = await fetch(`${geminiUrl}?key=${geminiApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geminiRequest)
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('Failed to call Gemini API:', e);
      return new Response(
        JSON.stringify({ error: `Failed to call Gemini API: ${message}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!geminiResponse.ok) {
      const bodyText = await geminiResponse.text().catch(() => '');
      console.error('Gemini API returned non-ok:', geminiResponse.status, bodyText);
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${geminiResponse.status} ${bodyText}` }),
        { status: geminiResponse.status || 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Read streaming response
    const reader = geminiResponse.body?.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

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
                }
              } catch (e) {
                // Skip invalid JSON chunks but keep the stream
                console.debug('Skipping invalid SSE JSON chunk', e);
              }
            }
          }
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('Error while reading Gemini stream:', e);
      return new Response(
        JSON.stringify({ error: `Error reading Gemini stream: ${message}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract JSON from response
    let budgetSuggestion = null;
    try {
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        budgetSuggestion = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse budget suggestion:', e, 'fullResponse:', fullResponse);
      return new Response(
        JSON.stringify({ error: 'Failed to parse budget suggestion from Gemini response', details: fullResponse }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        suggestion: budgetSuggestion,
        totalIncome,
        period
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error in budget-suggest:', error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
