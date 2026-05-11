import { useState, useEffect } from 'react';
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
import { getActiveBudget, getCurrentMonthSpending, getTotalIncome, getAlerts, createTransaction } from '@/db/api';
import type { Budget, Transaction, Alert as AlertType, TransactionCategory } from '@/types';
import { CATEGORY_LABELS, CATEGORY_ICONS } from '@/types';
import { Link } from 'react-router-dom';
import { AlertCircle, TrendingUp, TrendingDown, IndianRupee, Target, Plus, CreditCard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRealtime } from '@/contexts/RealtimeContext';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { transactionPipeline } = useRealtime();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [loading, setLoading] = useState(true);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
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

    const unsubscribe = transactionPipeline.addTransactionListener(async (tx) => {
      setTransactions((prev) => {
        if (prev.some((p) => p.id === tx.id)) return prev;
        const next = [tx, ...prev];
        next.sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)));
        return next;
      });

      try {
        const nextAlerts = await getAlerts(user.id, true);
        setAlerts(nextAlerts);
      } catch {
        // non-fatal
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user, transactionPipeline]);

  const calculateSpending = () => {
    const spending: Record<string, number> = {};
    transactions.forEach((t) => {
      spending[t.category] = (spending[t.category] || 0) + Number(t.amount);
    });
    return spending;
  };

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

  const spending = calculateSpending();
  
  // Merge actual spending with manual slider adjustments
  const totalSpendingByCategory: Record<string, number> = {};
  Object.keys(CATEGORY_LABELS).forEach((category) => {
    const actualSpent = spending[category] || 0;
    const manualAdjustment = manualSpending[category] || 0;
    totalSpendingByCategory[category] = actualSpent + manualAdjustment;
  });

  const totalSpent = Object.values(totalSpendingByCategory).reduce((a, b) => a + b, 0);
  const totalBudgeted = budget
    ? Number(budget.rent) +
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
    : 0;

  const remaining = totalIncome - totalSpent;
  const budgetUsagePercentage = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

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

      {/* Budget Breakdown */}
      {budget ? (
        <Card>
          <CardHeader>
            <CardTitle>Budget Breakdown</CardTitle>
            <p className="text-sm text-muted-foreground">Track your spending with sliders or add expenses manually</p>
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
