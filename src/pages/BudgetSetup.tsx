import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getActiveBudget, createBudget, getTotalIncome } from '@/db/api';
import { supabase } from '@/db/supabase';
import type { Budget, BudgetPeriod, BudgetSuggestion } from '@/types';
import { CATEGORY_LABELS } from '@/types';
import { Sparkles, Calculator, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { backendJson, getApiBaseUrl } from '@/lib/backend-api';

export default function BudgetSetup() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [totalIncome, setTotalIncome] = useState(0);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [aiSuggestion, setAiSuggestion] = useState<BudgetSuggestion | null>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [savingAiBudget, setSavingAiBudget] = useState(false);

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        const [budgetData, income] = await Promise.all([
          getActiveBudget(user.id),
          getTotalIncome(user.id)
        ]);

        setBudget(budgetData);
        setTotalIncome(income);

        if (budgetData) {
          setPeriod(budgetData.period);

          const nextAllocations: Record<string, string> = {};
          Object.keys(CATEGORY_LABELS).forEach((category) => {
            const value = (budgetData as any)[category];
            nextAllocations[category] = (value ?? 0).toString();
          });
          setAllocations(nextAllocations);
        } else {
          const nextAllocations: Record<string, string> = {};
          Object.keys(CATEGORY_LABELS).forEach((category) => {
            nextAllocations[category] = '0';
          });
          setAllocations(nextAllocations);
        }
      } catch (error) {
        console.error('Error loading budget data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  const handleGetAISuggestion = async () => {
    if (!user || totalIncome === 0) {
      toast({
        title: 'No income set',
        description: 'Please set up your income first',
        variant: 'destructive'
      });
      return;
    }

    setLoadingSuggestion(true);

    try {
      const payload = {
        userId: user.id,
        totalIncome,
        period
      };

      const apiBase = getApiBaseUrl();
      if (apiBase) {
        try {
          const data = await backendJson<{ suggestion: BudgetSuggestion }>(
            '/api/budget/suggest',
            {
              method: 'POST',
              body: payload
            }
          );
          setAiSuggestion(data.suggestion);
        } catch (backendError) {
          console.warn('Backend budget API failed, falling back to Supabase function:', backendError);
          const { data, error } = await supabase.functions.invoke('budget-suggest', {
            body: payload
          });

          if (error) throw error;

          setAiSuggestion(data.suggestion);
        }
      } else {
        const { data, error } = await supabase.functions.invoke('budget-suggest', {
          body: payload
        });

        if (error) throw error;

        setAiSuggestion(data.suggestion);
      }
      setShowApprovalDialog(true);
    } catch (error) {
      console.error('Failed to get AI suggestion:', error);

      const fallbackSuggestion: BudgetSuggestion = {
        rent: Number((totalIncome * 0.3).toFixed(2)),
        groceries: Number((totalIncome * 0.15).toFixed(2)),
        transport: Number((totalIncome * 0.1).toFixed(2)),
        entertainment: Number((totalIncome * 0.05).toFixed(2)),
        savings: Number((totalIncome * 0.2).toFixed(2)),
        emergency_fund: Number((totalIncome * 0.1).toFixed(2)),
        utilities: Number((totalIncome * 0.05).toFixed(2)),
        healthcare: Number((totalIncome * 0.03).toFixed(2)),
        education: Number((totalIncome * 0.02).toFixed(2)),
        dining: 0,
        shopping: 0,
        other: Number(Math.max(0, totalIncome - (totalIncome * 0.3 + totalIncome * 0.15 + totalIncome * 0.1 + totalIncome * 0.05 + totalIncome * 0.2 + totalIncome * 0.1 + totalIncome * 0.05 + totalIncome * 0.03 + totalIncome * 0.02)).toFixed(2))
      };

      setAiSuggestion(fallbackSuggestion);
      setShowApprovalDialog(true);
      toast({
        title: 'Using local budget guidance',
        description: 'Remote AI is unavailable right now, so a fallback budget plan was generated from your income.'
      });
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const handleApproveSuggestion = async () => {
    if (!aiSuggestion) return;
    if (!user) return;

    const newAllocations: Record<string, string> = {};
    Object.keys(CATEGORY_LABELS).forEach((category) => {
      newAllocations[category] = aiSuggestion[category as keyof BudgetSuggestion]?.toString() || '0';
    });

    const total = Object.values(newAllocations).reduce(
      (sum, val) => sum + (parseFloat(val) || 0),
      0
    );

    if (total > totalIncome) {
      setAllocations(newAllocations);
      setShowApprovalDialog(false);
      toast({
        title: 'Budget exceeds income',
        description: 'AI suggestion exceeds your income. Please adjust and save.',
        variant: 'destructive'
      });
      return;
    }

    setAllocations(newAllocations);

    try {
      setSavingAiBudget(true);
      const newBudget = await createBudget({
        user_id: user.id,
        period,
        total_income: totalIncome,
        rent: Number(aiSuggestion.rent || 0),
        groceries: Number(aiSuggestion.groceries || 0),
        transport: Number(aiSuggestion.transport || 0),
        entertainment: Number(aiSuggestion.entertainment || 0),
        savings: Number(aiSuggestion.savings || 0),
        emergency_fund: Number(aiSuggestion.emergency_fund || 0),
        utilities: Number(aiSuggestion.utilities || 0),
        healthcare: Number(aiSuggestion.healthcare || 0),
        education: Number(aiSuggestion.education || 0),
        dining: Number(aiSuggestion.dining || 0),
        shopping: Number(aiSuggestion.shopping || 0),
        other: Number(aiSuggestion.other || 0),
        is_active: true
      });

      setBudget(newBudget);
      setShowApprovalDialog(false);

      toast({
        title: 'Budget saved',
        description: 'AI budget has been saved successfully'
      });
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as any).message)
          : 'Failed to save AI budget';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    } finally {
      setSavingAiBudget(false);
    }
  };

  const handleSaveBudget = async () => {
    if (!user) return;

    const total = Object.values(allocations).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

    if (total > totalIncome) {
      toast({
        title: 'Budget exceeds income',
        description: 'Total allocations cannot exceed your income',
        variant: 'destructive'
      });
      return;
    }

    try {
      const newBudget = await createBudget({
        user_id: user.id,
        period,
        total_income: totalIncome,
        rent: parseFloat(allocations.rent || '0'),
        groceries: parseFloat(allocations.groceries || '0'),
        transport: parseFloat(allocations.transport || '0'),
        entertainment: parseFloat(allocations.entertainment || '0'),
        savings: parseFloat(allocations.savings || '0'),
        emergency_fund: parseFloat(allocations.emergency_fund || '0'),
        utilities: parseFloat(allocations.utilities || '0'),
        healthcare: parseFloat(allocations.healthcare || '0'),
        education: parseFloat(allocations.education || '0'),
        dining: parseFloat(allocations.dining || '0'),
        shopping: parseFloat(allocations.shopping || '0'),
        other: parseFloat(allocations.other || '0'),
        is_active: true
      });

      setBudget(newBudget);

      toast({
        title: 'Budget saved',
        description: 'Your budget has been created successfully'
      });
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as any).message)
          : 'Failed to save budget';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64 bg-muted" />
        <Skeleton className="h-96 bg-muted" />
      </div>
    );
  }

  const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  const remaining = totalIncome - totalAllocated;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Budget Setup</h1>
        <p className="text-sm md:text-base text-muted-foreground">Create and manage your budget</p>
      </div>

      {totalIncome === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Please set up your income first before creating a budget.
          </AlertDescription>
        </Alert>
      )}

      <Card className="floating-card border-none shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Budget Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Total Income</p>
              <p className="text-2xl font-bold">₹{totalIncome.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Allocated</p>
              <p className="text-2xl font-bold">₹{totalAllocated.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Remaining</p>
              <p className={`text-2xl font-bold ${remaining < 0 ? 'text-destructive' : 'text-success'}`}>
                ₹{remaining.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="period">Budget Period</Label>
            <Select value={period} onValueChange={(value) => setPeriod(value as BudgetPeriod)}>
              <SelectTrigger id="period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="manual" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="manual">
            <Calculator className="h-4 w-4 mr-2" />
            Manual Entry
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Sparkles className="h-4 w-4 mr-2" />
            AI Assisted
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Budget Allocations</CardTitle>
              <CardDescription>Enter amounts for each category</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
                  <div key={category} className="space-y-2">
                    <Label htmlFor={category}>{label}</Label>
                    <Input
                      id={category}
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={allocations[category] || ''}
                      onChange={(e) =>
                        setAllocations({ ...allocations, [category]: e.target.value })
                      }
                    />
                  </div>
                ))}
              </div>

              <Button onClick={handleSaveBudget} disabled={totalIncome === 0 || remaining < 0}>
                Save Budget
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Budget Suggestion</CardTitle>
              <CardDescription>
                Get a personalized budget recommendation based on your income and spending patterns
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={handleGetAISuggestion} disabled={loadingSuggestion || totalIncome === 0}>
                <Sparkles className="h-4 w-4 mr-2" />
                {loadingSuggestion ? 'Generating...' : 'Get AI Suggestion'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* AI Suggestion Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI Budget Suggestion</DialogTitle>
            <DialogDescription>
              Review and approve the AI-generated budget allocation
            </DialogDescription>
          </DialogHeader>

          {aiSuggestion && (
            <div className="space-y-2">
              {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
                <div key={category} className="flex justify-between items-center p-2 border rounded">
                  <span className="font-medium">{label}</span>
                  <span>₹{aiSuggestion[category as keyof BudgetSuggestion]?.toFixed(2) || '0.00'}</span>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleApproveSuggestion} disabled={savingAiBudget}>
              {savingAiBudget ? 'Saving...' : 'Approve & Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
