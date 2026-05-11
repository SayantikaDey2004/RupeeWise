import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { getChatHistory, clearChatHistory, createChatMessage, getIncomeRecords, getTotalIncome, getActiveBudget, getCurrentMonthSpending } from '@/db/api';
import { CATEGORY_LABELS } from '@/types';
import type { Budget, ChatMessage, Transaction } from '@/types';
import { Send, Bot, User, AlertCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getApiBaseUrl, getSupabaseAccessToken } from '@/lib/backend-api';

type BudgetStatus = 'good' | 'warning' | 'over';

type CategoryInsight = {
  category: string;
  label: string;
  budgeted: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  status: BudgetStatus;
};

function formatCurrency(value: number): string {
  return `₹${value.toFixed(2)}`;
}

function buildCategorySpendMap(monthTransactions: Transaction[]): Record<string, number> {
  return monthTransactions.reduce<Record<string, number>>((acc, tx) => {
    const category = String(tx.category || 'other');
    acc[category] = (acc[category] || 0) + Number(tx.amount);
    return acc;
  }, {});
}

function buildBudgetInsights(activeBudget: Budget | null, categorySpent: Record<string, number>): CategoryInsight[] {
  if (!activeBudget) return [];

  return Object.entries(CATEGORY_LABELS)
    .map(([category, label]) => {
      const budgeted = Number(activeBudget[category as keyof Budget] || 0);
      const spent = Number(categorySpent[category] || 0);
      const remaining = budgeted - spent;
      const percentUsed = budgeted > 0 ? (spent / budgeted) * 100 : 0;
      const status: BudgetStatus = percentUsed >= 100 ? 'over' : percentUsed >= 80 ? 'warning' : 'good';

      return {
        category,
        label,
        budgeted,
        spent,
        remaining,
        percentUsed,
        status
      };
    })
    .filter((entry) => entry.budgeted > 0)
    .sort((a, b) => b.percentUsed - a.percentUsed);
}

function detectCategoryInQuestion(lowerMessage: string): string | undefined {
  const categoryKeywords: Record<string, string[]> = {
    rent: ['rent'],
    groceries: ['grocery', 'groceries'],
    transport: ['transport', 'uber', 'ola', 'travel'],
    entertainment: ['entertainment', 'movie'],
    savings: ['savings', 'save'],
    emergency_fund: ['emergency', 'emergency fund'],
    utilities: ['utilities', 'electricity', 'water', 'internet', 'bill'],
    healthcare: ['healthcare', 'medical', 'medicine'],
    education: ['education', 'course', 'school'],
    dining: ['dining', 'food', 'restaurant', 'swiggy', 'zomato'],
    shopping: ['shopping', 'amazon', 'flipkart'],
    other: ['other']
  };

  return Object.entries(categoryKeywords).find(([, keywords]) =>
    keywords.some((keyword) => lowerMessage.includes(keyword))
  )?.[0];
}

function getAdvisorMode(lowerMessage: string):
  | 'spend_by_category'
  | 'budget_health'
  | 'savings_plan'
  | 'reduce_spending'
  | 'income_summary'
  | 'default' {
  if (lowerMessage.includes('income') || lowerMessage.includes('salary') || lowerMessage.includes('earning')) {
    return 'income_summary';
  }
  if (lowerMessage.includes('save') || lowerMessage.includes('savings') || lowerMessage.includes('goal')) {
    return 'savings_plan';
  }
  if (lowerMessage.includes('reduce') || lowerMessage.includes('cut') || lowerMessage.includes('optimize')) {
    return 'reduce_spending';
  }
  if (lowerMessage.includes('budget') || lowerMessage.includes('remaining') || lowerMessage.includes('overspend')) {
    return 'budget_health';
  }
  if (lowerMessage.includes('spent') || lowerMessage.includes('spend') || lowerMessage.includes('expense')) {
    return 'spend_by_category';
  }
  return 'default';
}

function buildAdvisorHeader(totalIncome: number, spentThisMonth: number, remaining: number): string {
  const burnRate = totalIncome > 0 ? (spentThisMonth / totalIncome) * 100 : 0;
  const health = burnRate >= 100 ? 'Critical' : burnRate >= 80 ? 'Watch' : 'Stable';

  return [
    '### Budget Advisor Snapshot',
    `- Income: **${formatCurrency(totalIncome)}**`,
    `- Spent This Month: **${formatCurrency(spentThisMonth)}**`,
    `- Remaining: **${formatCurrency(remaining)}**`,
    `- Budget Health: **${health} (${burnRate.toFixed(1)}% used)**`
  ].join('\n');
}

function topRecommendations(insights: CategoryInsight[], remaining: number): string {
  const lines: string[] = ['### Recommended Actions'];

  const over = insights.filter((i) => i.status === 'over').slice(0, 2);
  const warning = insights.filter((i) => i.status === 'warning').slice(0, 2);

  if (over.length > 0) {
    over.forEach((item) => {
      lines.push(`- ${item.label}: reduce by at least **${formatCurrency(Math.abs(item.remaining))}** to recover budget control.`);
    });
  }

  if (warning.length > 0) {
    warning.forEach((item) => {
      lines.push(`- ${item.label}: only **${formatCurrency(item.remaining)}** left, switch to low-spend mode for this category.`);
    });
  }

  if (over.length === 0 && warning.length === 0) {
    lines.push('- Your budget is healthy; keep tracking daily expenses and avoid unplanned spends.');
  }

  if (remaining > 0) {
    lines.push(`- Move **${formatCurrency(Math.max(0, remaining * 0.2))}** into savings/emergency reserve this cycle.`);
  }

  return lines.join('\n');
}

async function buildLocalApiContext(userId: string) {
  const [incomes, totalIncome, activeBudget, monthTransactions] = await Promise.all([
    getIncomeRecords(userId),
    getTotalIncome(userId),
    getActiveBudget(userId),
    getCurrentMonthSpending(userId)
  ]);

  const categorySpent = buildCategorySpendMap(monthTransactions);

  return {
    userMode: 'personal',
    totalIncome,
    incomeRecords: incomes,
    activeBudget,
    recentTransactions: monthTransactions.slice(0, 15),
    allCategorySpending: categorySpent,
    totalSpentThisMonth: Object.values(categorySpent).reduce((sum, amount) => sum + amount, 0),
    documentCount: 0
  };
}

async function buildLocalChatReply(userId: string, message: string, recentMessages: ChatMessage[] = []): Promise<string> {
  const [incomes, totalIncome, activeBudget, monthTransactions] = await Promise.all([
    getIncomeRecords(userId),
    getTotalIncome(userId),
    getActiveBudget(userId),
    getCurrentMonthSpending(userId)
  ]);

  const lowerMessage = message.toLowerCase();
  const spentThisMonth = monthTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
  const remaining = totalIncome - spentThisMonth;
  const categorySpent = buildCategorySpendMap(monthTransactions);
  const matchedCategory = detectCategoryInQuestion(lowerMessage);
  const insights = buildBudgetInsights(activeBudget, categorySpent);
  const mode = getAdvisorMode(lowerMessage);
  const incomeSummary = incomes.length > 0
    ? incomes
        .slice(0, 3)
        .map((income) => `${income.member_name}: ₹${Number(income.amount).toFixed(2)} / ${income.period}`)
        .join('\n')
    : 'No income sources have been added yet.';

  const lastDistinctUserMessage = [...recentMessages]
    .reverse()
    .find((item) => item.role === 'user' && item.message !== message)?.message;
  const continuityNote = lastDistinctUserMessage
    ? `Continuing from your earlier question about “${lastDistinctUserMessage.slice(0, 48)}${lastDistinctUserMessage.length > 48 ? '…' : ''}”.`
    : 'Here is the current read on your finances.';
  const header = `${buildAdvisorHeader(totalIncome, spentThisMonth, remaining)}

${continuityNote}`;

  if (mode === 'income_summary') {
    return `${header}

### Income Breakdown
- Total sources: **${incomes.length}**
- Total income: **${formatCurrency(totalIncome)}**

${incomeSummary}`;
  }

  if (mode === 'budget_health') {
    if (!activeBudget) {
      return `${header}

### Budget Status
No active budget is saved yet.

Set a budget first so I can provide category-level risk alerts and optimization tips.`;
    }

    const top3 = insights.slice(0, 3)
      .map((item) => `- ${item.label}: **${item.percentUsed.toFixed(1)}%** used (${formatCurrency(item.spent)} / ${formatCurrency(item.budgeted)})`)
      .join('\n');

    return `${header}

### Budget Health Details
${top3 || '- No category budget allocations found.'}

${topRecommendations(insights, remaining)}`;
  }

  if (mode === 'spend_by_category' && matchedCategory) {
    const amount = categorySpent[matchedCategory] || 0;
    const label = CATEGORY_LABELS[matchedCategory as keyof typeof CATEGORY_LABELS] || matchedCategory;
    const matchedInsight = insights.find((item) => item.category === matchedCategory);

    return `${header}

### Category Analysis: ${label}
- Spent this month: **${formatCurrency(amount)}**
${matchedInsight ? `- Budget: **${formatCurrency(matchedInsight.budgeted)}**` : '- Budget: **Not allocated**'}
${matchedInsight ? `- Remaining: **${formatCurrency(matchedInsight.remaining)}**` : '- Remaining: **Not available**'}

${topRecommendations(matchedInsight ? [matchedInsight] : insights.slice(0, 2), remaining)}`;
  }

  if (mode === 'savings_plan') {
    const suggestedSavings = Math.max(0, totalIncome * 0.2);
    const canSaveNow = Math.max(0, remaining * 0.3);
    return `${header}

### Savings Strategy
- Recommended monthly savings target (20%): **${formatCurrency(suggestedSavings)}**
- Safe amount you can move now: **${formatCurrency(canSaveNow)}**
- Emergency fund goal (6 months of core spend): **${formatCurrency(spentThisMonth * 6)}**

${topRecommendations(insights, remaining)}`;
  }

  if (mode === 'reduce_spending') {
    const highestSpend = Object.entries(categorySpent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, amt]) => `- ${(CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] || cat)}: **${formatCurrency(amt)}**`)
      .join('\n');

    return `${header}

### Where To Cut First
${highestSpend || '- No spending data found yet.'}

### 7-Day Control Plan
- Day 1: Freeze non-essential purchases.
- Day 2-3: Cap food-delivery/dining spends.
- Day 4-5: Shift upcoming purchases to lower-cost alternatives.
- Day 6-7: Review progress and rebalance category caps.

${topRecommendations(insights, remaining)}`;
  }

  if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return `Hello. I’m your budget advisor.

${header}

I can help you with:
- category-wise spending analysis
- budget risk alerts
- savings and emergency-fund planning
- concrete actions to reduce overspending`;
  }

  if (lowerMessage.includes('investment') || lowerMessage.includes('stock') || lowerMessage.includes('politics') || lowerMessage.includes('cricket')) {
    return "I'm designed to assist only with personal finance, budgeting, and expense-tracking questions.";
  }

  return `${header}

### Advisor Note
Ask me specifics like:
- "Where am I overspending?"
- "How much did I spend on groceries this month?"
- "Give me a savings plan for this month"
- "How can I reduce spending in 7 days?"`;
}

export default function Chat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [clearing, setClearing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    const loadHistory = async () => {
      try {
        const history = await getChatHistory(user.id);
        setMessages(history);
      } catch (error) {
        console.error('Error loading chat history:', error);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingMessage]);

  const handleSend = async () => {
    if (!input.trim() || !user || sending) return;

    const userMessage = input.trim();
    setInput('');
    setSending(true);
    setStreamingMessage('');

    // Add user message to UI
    const tempUserMessage: ChatMessage = {
      id: Date.now().toString(),
      user_id: user.id,
      role: 'user',
      message: userMessage,
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      const apiBase = getApiBaseUrl();
      let fullResponse = '';
      let usedLocalFallback = false;
      let persistChatLocally = false;

      try {
        if (apiBase) {
          const token = await getSupabaseAccessToken();
          const payload: Record<string, unknown> = {
            message: userMessage,
            userId: user.id
          };

          const headers: HeadersInit = {
            'Content-Type': 'application/json'
          };

          if (token) {
            headers.Authorization = `Bearer ${token}`;
          } else {
            // Send real local data to backend chat API when auth token is unavailable.
            payload.localContext = await buildLocalApiContext(user.id);
            payload.localHistory = messages.slice(-10).map((msg) => ({
              role: msg.role,
              message: msg.message
            }));
            persistChatLocally = true;
          }

          const response = await fetch(`${apiBase}/api/chat/stream`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            throw new Error('Failed to get response');
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data.trim()) {
                    try {
                      const parsed = JSON.parse(data);
                      if (parsed.text) {
                        fullResponse += parsed.text;
                        setStreamingMessage(fullResponse);
                      }
                    } catch {
                      // Skip invalid JSON chunks.
                    }
                  }
                }
              }
            }
          }

          if (!fullResponse.trim()) {
            throw new Error('Empty chat response');
          }
        } else if (supabaseUrl && supabaseAnonKey) {
          const token = await getSupabaseAccessToken();
          const headers: HeadersInit = {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey
          };

          if (token) {
            headers.Authorization = `Bearer ${token}`;
          }

          const response = await fetch(`${supabaseUrl}/functions/v1/gemini-chat`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              message: userMessage,
              userId: user.id,
              ...(token
                ? {}
                : {
                    localContext: await buildLocalApiContext(user.id),
                    localHistory: messages.slice(-10).map((msg) => ({
                      role: msg.role,
                      message: msg.message
                    }))
                  })
            })
          });

          if (!response.ok) {
            throw new Error('Failed to get response');
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data.trim()) {
                    try {
                      const parsed = JSON.parse(data);
                      if (parsed.text) {
                        fullResponse += parsed.text;
                        setStreamingMessage(fullResponse);
                      }
                    } catch {
                      // Skip invalid JSON chunks.
                    }
                  }
                }
              }
            }
          }

          if (!fullResponse.trim()) {
            throw new Error('Empty chat response');
          }
        } else {
          usedLocalFallback = true;
          fullResponse = await buildLocalChatReply(user.id, userMessage, messages.slice(-10));
        }
      } catch (error) {
        console.error('Error sending message:', error);

        let fallbackResponse = '';
        if (supabaseUrl && supabaseAnonKey) {
          try {
            const token = await getSupabaseAccessToken();
            const fallbackPayload: Record<string, unknown> = {
              message: userMessage,
              userId: user.id
            };

            if (!token) {
              fallbackPayload.localContext = await buildLocalApiContext(user.id);
              fallbackPayload.localHistory = messages.slice(-10).map((msg) => ({
                role: msg.role,
                message: msg.message
              }));
            }

            const fallbackHeaders: HeadersInit = {
              'Content-Type': 'application/json',
              apikey: supabaseAnonKey
            };

            if (token) {
              fallbackHeaders.Authorization = `Bearer ${token}`;
            }

            const fallbackResponseHttp = await fetch(`${supabaseUrl}/functions/v1/gemini-chat`, {
              method: 'POST',
              headers: fallbackHeaders,
              body: JSON.stringify(fallbackPayload)
            });

            if (fallbackResponseHttp.ok) {
              const reader = fallbackResponseHttp.body?.getReader();
              const decoder = new TextDecoder();

              if (reader) {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  const chunk = decoder.decode(value);
                  const lines = chunk.split('\n');

                  for (const line of lines) {
                    if (line.startsWith('data: ')) {
                      const data = line.slice(6);
                      if (data.trim()) {
                        try {
                          const parsed = JSON.parse(data);
                          if (parsed.text) {
                            fallbackResponse += parsed.text;
                            setStreamingMessage(fallbackResponse);
                          }
                        } catch {
                          // Skip invalid JSON chunks.
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch (fallbackError) {
            console.error('Supabase chat fallback failed:', fallbackError);
          }
        }

        if (fallbackResponse.trim()) {
          usedLocalFallback = true;
          fullResponse = fallbackResponse;
        } else {
          usedLocalFallback = true;
          fullResponse = await buildLocalChatReply(user.id, userMessage, messages.slice(-10));
        }
      }

      if (usedLocalFallback || persistChatLocally) {
        await createChatMessage({
          user_id: user.id,
          role: 'user',
          message: userMessage
        });
        await createChatMessage({
          user_id: user.id,
          role: 'model',
          message: fullResponse
        });
      }

      const modelMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        user_id: user.id,
        role: 'model',
        message: fullResponse,
        created_at: new Date().toISOString()
      };
      setMessages((prev) => [...prev, modelMessage]);
      setStreamingMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        user_id: user.id,
        role: 'model',
        message: 'Sorry, I encountered an error. Please try again.',
        created_at: new Date().toISOString()
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setSending(false);
    }
  };

  const handleClearChat = async () => {
    if (!user || clearing) return;
    
    setClearing(true);
    try {
      await clearChatHistory(user.id);
      setMessages([]);
      toast({
        title: 'Chat cleared',
        description: 'All chat history has been deleted successfully.',
      });
    } catch (error) {
      console.error('Error clearing chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to clear chat history. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64 bg-muted" />
        <Skeleton className="h-96 bg-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] lg:h-[calc(100vh-4rem)]">
      <div className="p-4 md:p-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">AI Finance Assistant</h1>
          <p className="text-sm md:text-base text-muted-foreground">Ask me anything about your finances</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 rounded-full"
              disabled={messages.length === 0 || clearing}
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Clear Chat</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear chat history?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all your chat messages and conversation history. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleClearChat} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Clear All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Alert className="m-4 md:m-6 mb-0">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          This assistant provides budgeting insights only and does not offer investment or legal advice.
        </AlertDescription>
      </Alert>

      <div className="flex-1 p-4 md:p-6 overflow-auto" ref={scrollRef}>
        <div className="space-y-4 max-w-3xl mx-auto pb-4">
          {messages.length === 0 && (
            <Card className="p-6 text-center floating-card">
              <Bot className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h3 className="text-lg font-semibold mb-2">Welcome to your Finance Assistant</h3>
              <p className="text-muted-foreground text-sm">
                Ask me about your spending, budget, or financial goals. I'm here to help!
              </p>
            </Card>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2 md:gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'model' && (
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5 text-primary-foreground" />
                </div>
              )}
              <div
                className={`rounded-2xl p-3 md:p-4 max-w-[calc(100%-3rem)] md:max-w-[80%] break-words overflow-hidden ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg'
                    : 'bg-muted shadow-md'
                }`}
              >
                {msg.role === 'model' ? (
                  <div className="prose prose-sm md:prose-base max-w-none prose-p:my-2 prose-strong:text-foreground prose-strong:font-bold break-words">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.message}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-sm md:text-base">{msg.message}</p>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-secondary to-primary flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-secondary-foreground" />
                </div>
              )}
            </div>
          ))}

          {streamingMessage && (
            <div className="flex gap-2 md:gap-3 justify-start">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="rounded-2xl p-3 md:p-4 max-w-[calc(100%-3rem)] md:max-w-[80%] bg-muted shadow-md break-words overflow-hidden">
                <div className="prose prose-sm md:prose-base max-w-none prose-p:my-2 prose-strong:text-foreground prose-strong:font-bold break-words">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {streamingMessage}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          {sending && !streamingMessage && (
            <div className="flex gap-2 md:gap-3 justify-start">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="rounded-2xl p-3 md:p-4 bg-muted shadow-md">
                <div className="flex gap-1">
                  <div className="h-2 w-2 rounded-full bg-foreground animate-bounce" />
                  <div className="h-2 w-2 rounded-full bg-foreground animate-bounce delay-100" />
                  <div className="h-2 w-2 rounded-full bg-foreground animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 md:p-6 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-20 lg:pb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2 max-w-3xl mx-auto"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your finances..."
            disabled={sending}
            className="flex-1 rounded-full"
          />
          <Button type="submit" disabled={sending || !input.trim()} className="rounded-full" size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
