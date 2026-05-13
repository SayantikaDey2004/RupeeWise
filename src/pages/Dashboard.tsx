import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getActiveBudget, getCurrentMonthSpending, getTotalIncome, getAlerts, createTransaction, deleteBudget, deleteAllUserData, getTransactions } from '@/db/api';
import { supabase } from '@/db/supabase';
import type { Budget, Transaction, Alert as AlertType, TransactionCategory } from '@/types';
import { CATEGORY_LABELS, CATEGORY_ICONS } from '@/types';
import { Link } from 'react-router-dom';
import { AlertCircle, TrendingUp, TrendingDown, IndianRupee, Target, Plus, CreditCard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRealtime } from '@/contexts/RealtimeContext';
import ExpenseAnalytics from '@/components/ExpenseAnalytics';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { transactionPipeline, documentPipeline, refreshTransactions } = useRealtime();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [loading, setLoading] = useState(true);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState<TransactionCategory>('other');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [manualSpending, setManualSpending] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        const [budgetData, transactionsData, income, alertsData] = await Promise.all([
          getActiveBudget(user.id),
          getCurrentMonthSpending(user.id),
          getTotalIncome(user.id),
          getAlerts(user.id, true)
        ]);

        setBudget(budgetData);
        setTransactions(transactionsData);
        setTotalIncome(income);
        setAlerts(alertsData);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  useEffect(() => {
    if (!user || !transactionPipeline) return;

    console.log('[Dashboard] Setting up transaction listener for user:', user.id);
    const unsubscribe = transactionPipeline.addTransactionListener(async (tx) => {
      console.log('[Dashboard] Received new transaction via listener:', tx.id, '₹' + tx.amount);
      setTransactions((prev) => {
        if (prev.some((p) => p.id === tx.id)) return prev;
        const next = [tx, ...prev];
        next.sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)));
        console.log('[Dashboard] Updated transactions, now have:', next.length, 'total');
        return next;
      });

      try {
        const nextAlerts = await getAlerts(user.id, true);
        console.log('[Dashboard] Fetched updated alerts:', nextAlerts.length);
        setAlerts(nextAlerts);
      } catch {
        // non-fatal
      }
    });

    // More aggressive polling: check every 2 seconds after OCR operations
    const pollInterval = setInterval(async () => {
      try {
        const freshData = await getCurrentMonthSpending(user.id);
        setTransactions((prev) => {
          // Always update to latest data from server to ensure consistency
          const hasNewTransactions = freshData.some(f => !prev.some(p => p.id === f.id));
          const hasMissingTransactions = prev.some(p => !freshData.some(f => f.id === p.id));
          
          if (hasNewTransactions || hasMissingTransactions || freshData.length !== prev.length) {
            console.log('[Dashboard] Polling detected data change. Had', prev.length, 'now have', freshData.length, 'transactions');
            return freshData;
          }
          return prev;
        });
        
        const freshAlerts = await getAlerts(user.id, true);
        setAlerts(freshAlerts);
      } catch (error) {
        console.error('[Dashboard] Polling error:', error);
      }
    }, 2000);  // Increased from 5 seconds to 2 seconds for faster detection

    return () => {
      console.log('[Dashboard] Cleaning up transaction listener and poll');
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [user, transactionPipeline]);

  // Listen for document processing completion and refresh transactions immediately
  useEffect(() => {
    if (!documentPipeline || !user) return;

    const handleDocumentProcessed = async () => {
      console.log('[Dashboard] Handling document processing...');
      try {
        // Wait a bit more for all database inserts to complete
        console.log('[Dashboard] Waiting for database to complete all transaction inserts...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Fetch ALL transactions (not just current month) to see any OCR insertions
        const freshAllTransactions = await getTransactions(user.id);
        console.log('[Dashboard] Fetched all transactions, found:', freshAllTransactions.length, 'total');
        
        // But for Dashboard spending, we still only use current month
        const freshData = await getCurrentMonthSpending(user.id);
        console.log('[Dashboard] Current month spending:', freshData.length, 'transactions in this month');
        
        setTransactions(freshData);
        
        // Fetch fresh alerts
        const freshAlerts = await getAlerts(user.id, true);
        console.log('[Dashboard] Fetched fresh alerts:', freshAlerts.length);
        setAlerts(freshAlerts);
        
        console.log('[Dashboard] Dashboard state fully updated with OCR results');
        
        // Also trigger an extra poll in 1 second to catch any stragglers
        setTimeout(async () => {
          try {
            const latestData = await getCurrentMonthSpending(user.id);
            if (latestData.length !== freshData.length) {
              console.log('[Dashboard] Extra poll detected more transactions, updating again...');
              setTransactions(latestData);
              const latestAlerts = await getAlerts(user.id, true);
              setAlerts(latestAlerts);
            }
          } catch (error) {
            console.error('[Dashboard] Error in extra poll:', error);
          }
        }, 1000);
      } catch (error) {
        console.error('[Dashboard] Error handling document processing:', error);
      }
    };

    console.log('[Dashboard] Adding document processed listener...');
    const unsubscribe = documentPipeline.addDocumentProcessedListener?.((docId: string) => {
      console.log('[Dashboard] Document processed event received:', docId);
      handleDocumentProcessed();
    });

    // Also set up a direct polling of documents table every 1.5 seconds as backup
    const documentPollInterval = setInterval(async () => {
      try {
        const { data: docs } = await supabase
          .from('documents')
          .select('id, processed')
          .eq('user_id', user.id)
          .eq('processed', true)
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (docs && docs.length > 0) {
          const lastProcessedDoc = docs[0];
          if (lastProcessedDoc && !window['lastProcessedDocId']) {
            console.log('[Dashboard] Document polling detected newly processed doc:', lastProcessedDoc.id);
            window['lastProcessedDocId'] = lastProcessedDoc.id;
            handleDocumentProcessed();
          } else if (lastProcessedDoc && lastProcessedDoc.id !== window['lastProcessedDocId']) {
            console.log('[Dashboard] Document polling detected new processed doc:', lastProcessedDoc.id);
            window['lastProcessedDocId'] = lastProcessedDoc.id;
            handleDocumentProcessed();
          }
        }
      } catch (error) {
        console.error('[Dashboard] Document polling error:', error);
      }
    }, 1500);

    return () => {
      console.log('[Dashboard] Cleaning up document listener and polling');
      if (unsubscribe) unsubscribe();
      clearInterval(documentPollInterval);
    };
  }, [documentPipeline, user]);

  const calculateSpending = () => {
    const spending: Record<string, number> = {};
    transactions.forEach((t) => {
      spending[t.category] = (spending[t.category] || 0) + Number(t.amount);
    });
    return spending;
  };

  // Use useMemo to ensure spending is recalculated whenever transactions change
  const spending = useMemo(() => {
    console.log('[Dashboard] Recalculating spending with', transactions.length, 'transactions');
    return calculateSpending();
  }, [transactions]);

  // Calculate total spending by category (actual + manual adjustments)
  const totalSpendingByCategory = useMemo(() => {
    const result: Record<string, number> = {};
    Object.keys(CATEGORY_LABELS).forEach((category) => {
      const actualSpent = spending[category] || 0;
      const manualAdjustment = manualSpending[category] || 0;
      result[category] = actualSpent + manualAdjustment;
    });
    return result;
  }, [spending, manualSpending]);

  const totalSpent = useMemo(() => {
    return Object.values(totalSpendingByCategory).reduce((a, b) => a + b, 0);
  }, [totalSpendingByCategory]);

  const handleAddExpense = async () => {
    if (!user || !expenseAmount || parseFloat(expenseAmount) <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Please enter a valid amount',
        variant: 'destructive'
      });
      return;
    }

    try {
      const newTransaction = await createTransaction({
        user_id: user.id,
        document_id: null,
        amount: parseFloat(expenseAmount),
        transaction_date: new Date().toISOString().split('T')[0],
        merchant: 'Manual Entry',
        category: expenseCategory,
        description: expenseDescription || 'Manual expense entry'
      });

      setTransactions([...transactions, newTransaction]);
      setExpenseAmount('');
      setExpenseDescription('');
      setAddExpenseOpen(false);

      toast({
        title: 'Expense added',
        description: 'Your expense has been recorded successfully'
      });

      // Check for budget alerts
      const spending = calculateSpending();
      const newSpending = (spending[expenseCategory] || 0) + parseFloat(expenseAmount);
      const allocated = budget ? Number(budget[expenseCategory as keyof Budget] || 0) : 0;

      if (allocated > 0) {
        const percentage = (newSpending / allocated) * 100;
        if (percentage >= 100) {
          toast({
            title: 'Budget exceeded',
            description: `You've exceeded your ${CATEGORY_LABELS[expenseCategory]} budget`,
            variant: 'destructive'
          });
        } else if (percentage >= 80) {
          toast({
            title: 'Budget warning',
            description: `You've used ${percentage.toFixed(0)}% of your ${CATEGORY_LABELS[expenseCategory]} budget`,
            variant: 'default'
          });
        }
      }
    } catch (error) {
      console.error('Error adding expense:', error);
      toast({
        title: 'Error',
        description: 'Failed to add expense',
        variant: 'destructive'
      });
    }
  };

  const handleSliderChange = (category: string, value: number[]) => {
    setManualSpending({
      ...manualSpending,
      [category]: value[0]
    });
  };

  const handleDeleteBudget = async () => {
    if (!user || !budget) {
      toast({
        title: 'Error',
        description: 'No budget to delete',
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsDeleting(true);
      
      // Delete budget and all associated data
      await deleteBudget(budget.id, user.id);
      await deleteAllUserData(user.id);
      
      // Clear all state
      setBudget(null);
      setTransactions([]);
      setAlerts([]);
      setTotalIncome(0);
      setManualSpending({});
      setDeleteDialogOpen(false);
      
      toast({
        title: 'Budget and all data deleted',
        description: 'Your budget, transactions, and documents have been permanently deleted.'
      });
    } catch (error) {
      console.error('Error deleting budget and data:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete budget and data',
        variant: 'destructive'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Calculate total budgeted amount
  const totalBudgeted = useMemo(() => {
    if (!budget) return 0;
    return (
      Number(budget.rent) +
      Number(budget.groceries) +
      Number(budget.transport) +
      Number(budget.entertainment) +
      Number(budget.savings) +
      Number(budget.emergency_fund) +
      Number(budget.utilities) +
      Number(budget.healthcare) +
      Number(budget.education) +
      Number(budget.dining) +
      Number(budget.shopping) +
      Number(budget.other)
    );
  }, [budget]);

  const remaining = useMemo(() => totalIncome - totalSpent, [totalIncome, totalSpent]);
  const budgetUsagePercentage = useMemo(() => totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0, [totalBudgeted, totalSpent]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64 bg-muted" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 bg-muted" />
          ))}
        </div>
        <Skeleton className="h-96 bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
          <p className="text-sm md:text-base text-muted-foreground">Your financial overview at a glance</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => navigate('/payment')} className="rounded-full flex-1 sm:flex-none">
            <CreditCard className="h-4 w-4 mr-2" />
            Quick Pay
          </Button>
          <Dialog open={addExpenseOpen} onOpenChange={setAddExpenseOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full flex-1 sm:flex-none">
                <Plus className="h-4 w-4 mr-2" />
                Add Expense
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Manual Expense</DialogTitle>
              <DialogDescription>
                Record an expense manually to track your spending
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={expenseCategory} onValueChange={(value) => setExpenseCategory(value as TransactionCategory)}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {CATEGORY_ICONS[value as TransactionCategory]} {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  placeholder="What did you spend on?"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddExpenseOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddExpense}>
                Add Expense
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.slice(0, 3).map((alert) => (
            <Alert key={alert.id} variant={alert.alert_type === 'budget_exceeded' ? 'destructive' : 'default'}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="floating-card border-none shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
              <IndianRupee className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">₹{totalIncome.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">Current period</p>
          </CardContent>
        </Card>

        <Card className="floating-card border-none shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <TrendingDown className="h-5 w-5 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">₹{totalSpent.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">This month</p>
          </CardContent>
        </Card>

        <Card className="floating-card border-none shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Remaining</CardTitle>
            <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${remaining < 0 ? 'text-destructive' : 'text-success'}`}>
              ₹{remaining.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Available balance</p>
          </CardContent>
        </Card>

        <Card className="floating-card border-none shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Budget Usage</CardTitle>
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Target className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${budgetUsagePercentage > 100 ? 'text-destructive' : budgetUsagePercentage > 80 ? 'text-warning' : 'text-primary'}`}>
              {budgetUsagePercentage.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Of total budget</p>
          </CardContent>
        </Card>
      </div>

      {/* Expense Analytics Charts */}
      <ExpenseAnalytics transactions={transactions} />

      {/* Budget Breakdown */}
      {budget ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1">
                <CardTitle>Budget Breakdown</CardTitle>
                <p className="text-sm text-muted-foreground">Track your spending with sliders or add expenses manually</p>
              </div>
              <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="w-full sm:w-auto">
                    Delete Budget
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Budget and All Data</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to delete your entire budget, all transactions, and all uploaded documents? This action cannot be undone. All your financial data will be permanently removed.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={handleDeleteBudget} disabled={isDeleting}>
                      {isDeleting ? 'Deleting All Data...' : 'Delete Everything'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
              const allocated = Number(budget[category as keyof Budget] || 0);
              const actualSpent = spending[category] || 0;
              const manualAdjustment = manualSpending[category] || 0;
              const totalSpentInCategory = actualSpent + manualAdjustment;
              const percentage = allocated > 0 ? (totalSpentInCategory / allocated) * 100 : 0;

              if (allocated === 0) return null;

              return (
                <div key={category} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS]}</span>
                      <span className="font-medium">{label}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      ₹{totalSpentInCategory.toFixed(2)} / ₹{allocated.toFixed(2)}
                    </div>
                  </div>
                  <Progress
                    value={Math.min(percentage, 100)}
                    className="h-2"
                    indicatorClassName={percentage > 100 ? 'bg-destructive' : percentage > 80 ? 'bg-warning' : 'bg-primary'}
                  />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Adjust spending tracker</span>
                      <span>+₹{manualAdjustment.toFixed(2)}</span>
                    </div>
                    <Slider
                      value={[manualAdjustment]}
                      onValueChange={(value) => handleSliderChange(category, value)}
                      max={allocated}
                      step={10}
                      className="w-full"
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Active Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">You haven't set up a budget yet. Create one to start tracking your spending.</p>
            <Button asChild>
              <Link to="/budget">Create Budget</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
