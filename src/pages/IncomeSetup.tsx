import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { getIncomeRecords, createIncomeRecord, deleteIncomeRecord, getTotalIncome, getProfile, updateUserMode } from '@/db/api';
import type { IncomeRecord, BudgetPeriod, UserMode } from '@/types';
import { Trash2, Plus, IndianRupee, Users, User as UserIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function IncomeSetup() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [incomes, setIncomes] = useState<IncomeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<UserMode>('personal');
  const [memberName, setMemberName] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [totalIncome, setTotalIncome] = useState(0);

  useEffect(() => {
    if (!user || !profile) return;

    const loadData = async () => {
      try {
        const [incomesData, total] = await Promise.all([
          getIncomeRecords(user.id),
          getTotalIncome(user.id)
        ]);
        setIncomes(incomesData);
        setTotalIncome(total);
        setMode(profile.user_mode);
      } catch (error) {
        console.error('Error loading income data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, profile]);

  const handleModeChange = async (newMode: UserMode) => {
    if (!user) return;

    try {
      await updateUserMode(user.id, newMode);
      setMode(newMode);
      await refreshProfile();
      toast({
        title: 'Mode updated',
        description: `Switched to ${newMode} mode`
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update mode',
        variant: 'destructive'
      });
    }
  };

  const handleAddIncome = async () => {
    if (!user || !memberName || !amount) return;

    try {
      const newIncome = await createIncomeRecord({
        user_id: user.id,
        member_name: memberName,
        amount: parseFloat(amount),
        period,
        is_primary: incomes.length === 0
      });

      setIncomes([...incomes, newIncome]);
      setTotalIncome(totalIncome + parseFloat(amount));
      setMemberName('');
      setAmount('');

      toast({
        title: 'Income added',
        description: 'Income record created successfully'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add income',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteIncome = async (id: string, incomeAmount: number) => {
    try {
      await deleteIncomeRecord(id);
      setIncomes(incomes.filter((i) => i.id !== id));
      setTotalIncome(totalIncome - incomeAmount);

      toast({
        title: 'Income deleted',
        description: 'Income record removed successfully'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete income',
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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Income Setup</h1>
        <p className="text-sm md:text-base text-muted-foreground">Manage your income sources</p>
      </div>

      {/* Mode Selection */}
      <Card className="floating-card border-none shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">User Mode</CardTitle>
          <CardDescription className="text-sm">Choose between personal or family mode</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={mode} onValueChange={(value) => handleModeChange(value as UserMode)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="personal" id="personal" />
              <Label htmlFor="personal" className="flex items-center gap-2 cursor-pointer">
                <UserIcon className="h-4 w-4" />
                Personal Mode - Single income user
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="family" id="family" />
              <Label htmlFor="family" className="flex items-center gap-2 cursor-pointer">
                <Users className="h-4 w-4" />
                Family Mode - Multiple earning members
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Total Income Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5" />
            Total Income
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">₹{totalIncome.toFixed(2)}</div>
          <p className="text-sm text-muted-foreground mt-1">Combined {period} income</p>
        </CardContent>
      </Card>

      {/* Add Income */}
      <Card>
        <CardHeader>
          <CardTitle>Add Income Source</CardTitle>
          <CardDescription>
            {mode === 'family' ? 'Add income for each family member' : 'Add your income'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="member-name">
                {mode === 'family' ? 'Member Name' : 'Income Source'}
              </Label>
              <Input
                id="member-name"
                placeholder={mode === 'family' ? 'e.g., John' : 'e.g., Salary'}
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="period">Period</Label>
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

          <Button onClick={handleAddIncome} disabled={!memberName || !amount}>
            <Plus className="h-4 w-4 mr-2" />
            Add Income
          </Button>
        </CardContent>
      </Card>

      {/* Income List */}
      {incomes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Income Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {incomes.map((income) => (
                <div
                  key={income.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{income.member_name}</p>
                    <p className="text-sm text-muted-foreground">
                      ₹{Number(income.amount).toFixed(2)} / {income.period}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteIncome(income.id, Number(income.amount))}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
