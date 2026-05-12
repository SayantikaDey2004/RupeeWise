/**
 * Real-time Processing Context
 * Provides real-time data processing capabilities throughout the app
 * Inspired by Pathway framework patterns
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  RealtimeProcessingManager,
  TransactionPipeline,
  BudgetMonitoringPipeline,
  DocumentProcessingPipeline,
  type AnomalyResult,
  type BudgetAlert
} from '@/lib/realtime-processor';
import type { Transaction, Budget } from '@/types';
import { useToast } from '@/hooks/use-toast';

interface RealtimeContextType {
  transactionPipeline: TransactionPipeline | null;
  budgetPipeline: BudgetMonitoringPipeline | null;
  documentPipeline: DocumentProcessingPipeline | null;
  isActive: boolean;
  recentAnomalies: AnomalyResult[];
  recentAlerts: BudgetAlert[];
  refreshTransactions: () => Promise<void>;
}

const RealtimeContext = createContext<RealtimeContextType>({
  transactionPipeline: null,
  budgetPipeline: null,
  documentPipeline: null,
  isActive: false,
  recentAnomalies: [],
  recentAlerts: [],
  refreshTransactions: async () => {}
});

export const useRealtime = () => useContext(RealtimeContext);

interface RealtimeProviderProps {
  children: ReactNode;
}

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [manager, setManager] = useState<RealtimeProcessingManager | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [recentAnomalies, setRecentAnomalies] = useState<AnomalyResult[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<BudgetAlert[]>([]);

  useEffect(() => {
    if (!user) {
      // Clean up when user logs out
      if (manager) {
        manager.stopAll();
        setManager(null);
        setIsActive(false);
        setRecentAnomalies([]);
        setRecentAlerts([]);
      }
      return;
    }

    // Initialize real-time processing manager
    const processingManager = new RealtimeProcessingManager(user.id);

    // Set up transaction pipeline with callbacks
    const transactionPipeline = processingManager.getTransactionPipeline();
    transactionPipeline.onTransaction = (_transaction: Transaction) => {
      // Optional: Show toast for new transactions
      // Disabled by default to avoid notification spam
    };

    transactionPipeline.onAnomaly = (anomaly: AnomalyResult) => {
      setRecentAnomalies(prev => [anomaly, ...prev].slice(0, 10));
      
      if (anomaly.severity === 'high') {
        toast({
          title: '⚠️ Unusual Transaction Detected',
          description: anomaly.reason,
          variant: 'destructive'
        });
      }
    };

    transactionPipeline.onBudgetAlert = (alert: BudgetAlert) => {
      setRecentAlerts(prev => {
        // Avoid duplicate alerts for same category
        const filtered = prev.filter(a => a.category !== alert.category);
        return [alert, ...filtered].slice(0, 10);
      });

      const categoryName = alert.category.charAt(0).toUpperCase() + alert.category.slice(1);
      
      if (alert.status === 'exceeded') {
        toast({
          title: `🔴 Budget Exceeded: ${categoryName}`,
          description: `You've spent ₹${alert.spent.toFixed(2)} of ₹${alert.budgeted.toFixed(2)} (${alert.percentUsed.toFixed(0)}%)`,
          variant: 'destructive'
        });
      } else if (alert.status === 'warning') {
        toast({
          title: `⚠️ Budget Warning: ${categoryName}`,
          description: `You've used ${alert.percentUsed.toFixed(0)}% of your budget (₹${alert.spent.toFixed(2)} / ₹${alert.budgeted.toFixed(2)})`,
        });
      }
    };

    // Set up budget pipeline
    const budgetPipeline = processingManager.getBudgetPipeline();
    budgetPipeline.onBudgetUpdate = (_budget: Budget) => {
      // Optional: Handle budget updates
      // Could trigger dashboard refresh or show notification
    };

    // Set up document pipeline
    const documentPipeline = processingManager.getDocumentPipeline();
    documentPipeline.onDocumentProcessed = (_documentId: string) => {
      toast({
        title: '✅ Document Processed',
        description: 'Transactions have been extracted and added to your account.',
      });
    };

    // Start all pipelines
    processingManager.startAll();
    setManager(processingManager);
    setIsActive(true);

    // Cleanup on unmount
    return () => {
      processingManager.stopAll();
    };
  }, [user, toast]);

  return (
    <RealtimeContext.Provider
      value={{
        transactionPipeline: manager?.getTransactionPipeline() || null,
        budgetPipeline: manager?.getBudgetPipeline() || null,
        documentPipeline: manager?.getDocumentPipeline() || null,
        isActive,
        recentAnomalies,
        recentAlerts,
        refreshTransactions: async () => {
          if (manager) {
            await manager.getTransactionPipeline().refreshRecentTransactions();
          }
        }
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}
