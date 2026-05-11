import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getTransactions } from '@/db/api';
import type { Transaction, TransactionCategory } from '@/types';
import { CATEGORY_LABELS, CATEGORY_ICONS } from '@/types';
import { CreditCard } from 'lucide-react';

export default function Transactions() {
  const { user } = useAuth();
  const { transactionPipeline } = useRealtime();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  useEffect(() => {
    if (!user) return;

    const loadTransactions = async () => {
      try {
        const data = await getTransactions(user.id);
        setTransactions(data);
      } catch (error) {
        console.error('Error loading transactions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, [user]);

  useEffect(() => {
    if (!transactionPipeline) return;

    return transactionPipeline.addTransactionListener((transaction) => {
      setTransactions((prev) => {
        const next = [transaction, ...prev.filter((t) => t.id !== transaction.id)];
        next.sort(
          (a, b) =>
            new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
        );
        return next;
      });
    });
  }, [transactionPipeline]);

  const filteredTransactions =
    filterCategory === 'all'
      ? transactions
      : transactions.filter((t) => t.category === filterCategory);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64 bg-muted" />
        <Skeleton className="h-96 bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Transactions</h1>
          <p className="text-sm md:text-base text-muted-foreground">View all your transactions</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Button onClick={() => navigate('/payment')} className="gap-2 rounded-full">
            <CreditCard className="h-4 w-4" />
            Pay Now
          </Button>
          <div className="w-full sm:w-64">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="rounded-full">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {filteredTransactions.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">No transactions found</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="text-2xl">
                      {CATEGORY_ICONS[transaction.category as TransactionCategory]}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{transaction.merchant || 'Unknown Merchant'}</p>
                      <p className="text-sm text-muted-foreground">
                        {transaction.description || CATEGORY_LABELS[transaction.category]}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-bold">₹{Number(transaction.amount).toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(transaction.transaction_date).toLocaleDateString()}
                    </p>
                  </div>

                  <Badge variant="outline" className="ml-4">
                    {CATEGORY_LABELS[transaction.category]}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
