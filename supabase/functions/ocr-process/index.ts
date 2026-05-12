import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OCRRequest {
  documentId: string;
  fileUrl: string;
  userId: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, fileUrl, userId }: OCRRequest = await req.json();

    if (!documentId || !fileUrl || !userId) {
      return new Response(
        JSON.stringify({ error: 'documentId, fileUrl, and userId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Call OCR API
    const ocrApiKey = Deno.env.get('INTEGRATIONS_API_KEY');
    const ocrUrl = 'https://app-9hnntffjcnb5-api-W9z3M6eONl3L.gateway.appmedo.com/parse/image';

    const formData = new FormData();
    formData.append('url', fileUrl);
    formData.append('language', 'eng');
    formData.append('isTable', 'true');

    console.log('Calling OCR API with:', { fileUrl, language: 'eng' });

    const ocrResponse = await fetch(ocrUrl, {
      method: 'POST',
      headers: {
        'X-Gateway-Authorization': `Bearer ${ocrApiKey}`
      },
      body: formData
    });

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error('OCR API error response:', errorText);
      throw new Error(`OCR API error: ${ocrResponse.statusText} - ${errorText}`);
    }

    const ocrResult = await ocrResponse.json();
    console.log('OCR API response keys:', Object.keys(ocrResult));
    
    // Handle different response formats
    let extractedText = '';
    
    if (ocrResult.ParsedResults && Array.isArray(ocrResult.ParsedResults) && ocrResult.ParsedResults.length > 0) {
      extractedText = ocrResult.ParsedResults[0]?.ParsedText || '';
    } else if (typeof ocrResult === 'string') {
      extractedText = ocrResult;
    } else if (ocrResult.text) {
      extractedText = ocrResult.text;
    } else if (ocrResult.parsedText) {
      extractedText = ocrResult.parsedText;
    } else if (ocrResult.result) {
      extractedText = typeof ocrResult.result === 'string' ? ocrResult.result : JSON.stringify(ocrResult.result);
    }

    // Clean up extracted text
    extractedText = extractedText
      .trim()
      .replace(/\n\s*\n/g, '\n') // Remove multiple blank lines
      .replace(/\s+/g, ' '); // Normalize whitespace

    console.log('Extracted text length:', extractedText.length, 'Text preview:', extractedText.substring(0, 200));

    if (!extractedText || extractedText.length < 10) {
      console.error('OCR extraction failed - no meaningful text extracted');
      return new Response(
        JSON.stringify({ error: 'No text extracted from document', debug: { ocrResult } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update document with OCR text and metadata
    const documentMetadata = {
      ocr_text: extractedText,
      text_length: extractedText.length,
      processed_at: new Date().toISOString()
    };
    
    await supabase
      .from('documents')
      .update(documentMetadata)
      .eq('id', documentId);

    // Use Gemini to parse structured transaction data
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent';

    const parsePrompt = `You are an expert financial document analyzer. Your task is to extract transaction information from the provided text.

CRITICAL RULES:
1. Return ONLY valid JSON - no explanations, markdown, or extra text
2. Return an array even if empty: []
3. Extract EVERY transaction you find, no matter how small
4. Use YYYY-MM-DD date format (IMPORTANT: Use TODAY's date 2026-05-12 as default for recent transactions)
5. Use amounts as plain numbers only (remove all currency symbols, commas, etc.)
6. Match category exactly from the valid list below
7. If you find a line with amount + date + merchant, that's a transaction

IMPORTANT DATE LOGIC:
- If a receipt shows a date like "5-12" or "May 12", use 2026-05-12 (TODAY)
- If a date appears to be from a RECEIPT (not a statement), use 2026-05-12
- Only use dates other than 2026-05-12 if explicitly shown as a full historical date (e.g., "Statement Date: 2026-01-15")
- When uncertain, default to 2026-05-12 (TODAY)
- AVOID parsing casual dates like "1-1" or "01-01" as January 1st - these are likely noise

VALID CATEGORIES (use exactly):
rent, groceries, transport, entertainment, savings, emergency_fund, utilities, healthcare, education, dining, shopping, other

PARSING RULES:
- Look for patterns: "Item/Merchant Amount Date" or "Date Merchant Amount"
- Common formats: "Starbucks 150" or "Uber 250"
- For unclear items, map to most logical category
- If amount appears without merchant, use category name as merchant
- Ignore headers, footers, and summary lines

TEXT TO PARSE:
${extractedText}

Return ONLY this JSON format with NO other text:
[
  {"amount": 123.45, "date": "2026-05-12", "merchant": "Store Name", "category": "groceries", "description": "Item description"}
]

If no transactions found, return: []`;

    console.log('Sending to Gemini with prompt length:', parsePrompt.length);

    const geminiRequest = {
      contents: [
        { role: 'user', parts: [{ text: parsePrompt }] }
      ]
    };

    const geminiResponse = await fetch(`${geminiUrl}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${geminiApiKey}`
      },
      body: JSON.stringify(geminiRequest)
    });

    if (!geminiResponse.ok) {
      throw new Error(`Gemini API error: ${geminiResponse.statusText}`);
    }

    // Read streaming response
    const reader = geminiResponse.body?.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

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
              // Skip invalid JSON
            }
          }
        }
      }
    }

    // Extract JSON from response
    let transactions = [];
    console.log('Gemini full response length:', fullResponse.length);
    console.log('Gemini response preview:', fullResponse.substring(0, 500));
    
    try {
      // Try to find JSON array in response
      const jsonMatch = fullResponse.match(/\[\s*\{[\s\S]*?\}\s*\]|\[\s*\]/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0];
        console.log('Found JSON:', jsonStr.substring(0, 200));
        transactions = JSON.parse(jsonStr);
        
        // Validate transactions structure
        if (!Array.isArray(transactions)) {
          console.error('Parsed value is not an array:', typeof transactions);
          transactions = [];
        } else {
          // Filter out invalid transactions
          transactions = transactions.filter(t => {
            return t && typeof t === 'object' && 
                   (t.amount !== undefined || t.date !== undefined || t.merchant !== undefined);
          });
          console.log('Valid transactions extracted:', transactions.length);
        }
      } else {
        console.log('No JSON array found in response');
        // Try to extract just the array content
        const arrayStart = fullResponse.indexOf('[');
        const arrayEnd = fullResponse.lastIndexOf(']');
        if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
          const jsonStr = fullResponse.substring(arrayStart, arrayEnd + 1);
          console.log('Attempting to parse extracted range:', jsonStr.substring(0, 100));
          transactions = JSON.parse(jsonStr);
        }
      }
    } catch (e) {
      console.error('Failed to parse transactions from Gemini:', e, 'Response:', fullResponse.substring(0, 300));
      transactions = [];
    }

    // Get today's date as default
    const today = new Date().toISOString().split('T')[0];

    // Insert transactions into database
    if (transactions.length > 0) {
      // Validate and clean transactions before insertion
      const validCategories = new Set([
        'rent', 'groceries', 'transport', 'entertainment', 'savings',
        'emergency_fund', 'utilities', 'healthcare', 'education', 'dining', 'shopping', 'other'
      ]);

      const transactionsToInsert = transactions
        .map((t: any) => {
          // Validate amount
          const amount = parseFloat(t.amount);
          if (isNaN(amount) || amount <= 0) return null;

          // Validate date - use today if date is missing or looks suspicious
          let date = t.date || today;
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          
          // If date doesn't match proper format, use today's date
          if (!dateRegex.test(date)) {
            console.log('[OCR] Invalid date format "' + date + '", using today:', today);
            date = today;
          }
          
          // If date is from previous year/month and looks like noise (e.g., 2026-01-01), 
          // replace with today's date unless it's explicitly a historical statement
          const transactionDate = new Date(date);
          const todayDate = new Date(today);
          const daysDifference = Math.floor((todayDate.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDifference > 30) {
            // If transaction is from more than 30 days ago, it's likely a historical receipt
            // Keep the extracted date
            console.log('[OCR] Keeping historical date:', date, '(' + daysDifference + ' days old)');
          } else if (daysDifference < -1) {
            // Future dates are invalid, use today
            console.log('[OCR] Future date detected, using today');
            date = today;
          }

          // Validate category
          const validCategories = new Set([
            'rent', 'groceries', 'transport', 'entertainment', 'savings',
            'emergency_fund', 'utilities', 'healthcare', 'education', 'dining', 'shopping', 'other'
          ]);
          const category = validCategories.has(t.category) ? t.category : 'other';

          return {
            user_id: userId,
            document_id: documentId,
            amount: amount,
            transaction_date: date,
            merchant: (t.merchant || 'Unknown').substring(0, 255),
            category: category,
            description: (t.description || '').substring(0, 500)
          };
        })
        .filter((t: any) => t !== null);

      console.log('Inserting valid transactions:', transactionsToInsert.length);

      if (transactionsToInsert.length > 0) {
        const { error: insertError } = await supabase.from('transactions').insert(transactionsToInsert);
        if (insertError) {
          console.error('Transaction insert error:', insertError);
          throw insertError;
        }
      }

      // Analyze spending patterns and suggest budget
      const spendingByCategory: Record<string, number> = {};
      transactionsToInsert.forEach((t: any) => {
        spendingByCategory[t.category] = (spendingByCategory[t.category] || 0) + t.amount;
      });

      // Get user's total income
      const { data: incomeRecords } = await supabase
        .from('income_records')
        .select('amount')
        .eq('user_id', userId);

      const totalIncome = incomeRecords?.reduce((sum, rec) => sum + parseFloat(rec.amount), 0) || 0;

      // If user has income but no active budget, suggest one
      if (totalIncome > 0) {
        const { data: existingBudget } = await supabase
          .from('budgets')
          .select('id')
          .eq('user_id', userId)
          .eq('is_active', true)
          .maybeSingle();

        if (!existingBudget) {
          // Generate budget suggestion based on spending patterns
          const budgetPrompt = `Based on the following spending patterns from uploaded documents, create a balanced monthly budget for a user with total income of ₹${totalIncome}.

Observed spending patterns:
${JSON.stringify(spendingByCategory, null, 2)}

Create a comprehensive budget allocation across these categories:
- rent, groceries, transport, entertainment, savings, emergency_fund, utilities, healthcare, education, dining, shopping, other

Return ONLY a valid JSON object with this exact format:
{
  "rent": 0,
  "groceries": 0,
  "transport": 0,
  "entertainment": 0,
  "savings": 0,
  "emergency_fund": 0,
  "utilities": 0,
  "healthcare": 0,
  "education": 0,
  "dining": 0,
  "shopping": 0,
  "other": 0
}

Guidelines:
1. Allocate higher amounts to categories with observed spending
2. Ensure savings is at least 20% of income
3. Emergency fund should be at least 10% of income
4. Total allocations should not exceed total income
5. All values must be positive numbers in Indian Rupees`;

          const geminiRequest = {
            contents: [
              { role: 'user', parts: [{ text: budgetPrompt }] }
            ]
          };

          const geminiResponse = await fetch(`${geminiUrl}?key=${geminiApiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${geminiApiKey}`
            },
            body: JSON.stringify(geminiRequest)
          });

          if (geminiResponse.ok) {
            const reader = geminiResponse.body?.getReader();
            const decoder = new TextDecoder();
            let budgetResponse = '';

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
                        budgetResponse += text;
                      }
                    } catch (e) {
                      // Skip invalid JSON
                    }
                  }
                }
              }
            }

            // Extract JSON from response
            try {
              const jsonMatch = budgetResponse.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const suggestedBudget = JSON.parse(jsonMatch[0]);

                // Create the suggested budget
                await supabase.from('budgets').insert({
                  user_id: userId,
                  period: 'monthly',
                  total_income: totalIncome,
                  rent: suggestedBudget.rent || 0,
                  groceries: suggestedBudget.groceries || 0,
                  transport: suggestedBudget.transport || 0,
                  entertainment: suggestedBudget.entertainment || 0,
                  savings: suggestedBudget.savings || 0,
                  emergency_fund: suggestedBudget.emergency_fund || 0,
                  utilities: suggestedBudget.utilities || 0,
                  healthcare: suggestedBudget.healthcare || 0,
                  education: suggestedBudget.education || 0,
                  dining: suggestedBudget.dining || 0,
                  shopping: suggestedBudget.shopping || 0,
                  other: suggestedBudget.other || 0,
                  is_active: true
                });
              }
            } catch (e) {
              console.error('Failed to parse budget suggestion:', e);
            }
          }
        }
      }
    }

    // Mark document as processed
    console.log('Marking document as processed:', documentId);
    const { error: updateProcessedError } = await supabase
      .from('documents')
      .update({ processed: true })
      .eq('id', documentId);

    if (updateProcessedError) {
      console.error('Failed to mark document as processed:', updateProcessedError);
    }

    console.log('OCR process completed. Transactions extracted:', transactions.length);

    return new Response(
      JSON.stringify({
        success: true,
        extractedText: extractedText.substring(0, 500), // Send preview only
        transactions: transactions,
        transactionCount: transactions.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ocr-process:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
