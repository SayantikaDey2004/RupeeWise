/**
 * Real-time Data Processing Module
 * Inspired by Pathway framework patterns for streaming data processing
 * Provides real-time transaction processing, anomaly detection, budget monitoring,
 * chat streaming, notifications, and analytics
 */

import { supabase } from '@/db/supabase';
import type { Transaction, Budget } from '@/types';

export interface ProcessingPipeline {
  subscribe: () => void;
  unsubscribe: () => void;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  severity: 'low' | 'medium' | 'high';
  reason: string;
  transaction: Transaction;
}

export interface BudgetAlert {
  category: string;
  budgeted: number;
  spent: number;
  percentUsed: number;
  status: 'warning' | 'exceeded';
}

// Chat Types
export interface ChatMessage {
  role: 'user' | 'model';
  message: string;
  correlation_id?: string;
}

export interface ChatChunk {
  correlation_id: string;
  event: 'chunk' | 'done' | 'error';
  text?: string;
  error?: string;
}

// Notification Types
export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  channel: string;
  is_read: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// Analytics Types
export interface AnalyticsData {
  period: string;
  total_spent: number;
  category_spending: Record<string, number>;
  transaction_count: number;
}

/**
 * Real-time Transaction Processing Pipeline
 * Monitors new transactions and triggers processing workflows
 */
export class TransactionPipeline implements ProcessingPipeline {
  private userId: string;
  private channel: any;
  private eventSource: EventSource | null = null;
  private transactionListeners = new Set<(transaction: Transaction) => void>();
  private anomalyListeners = new Set<(anomaly: AnomalyResult) => void>();
  private budgetAlertListeners = new Set<(alert: BudgetAlert) => void>();
  public onTransaction?: (transaction: Transaction) => void;
  public onAnomaly?: (anomaly: AnomalyResult) => void;
  public onBudgetAlert?: (alert: BudgetAlert) => void;

  constructor(
    userId: string,
    callbacks?: {
      onTransaction?: (transaction: Transaction) => void;
      onAnomaly?: (anomaly: AnomalyResult) => void;
      onBudgetAlert?: (alert: BudgetAlert) => void;
    }
  ) {
    this.userId = userId;
    this.onTransaction = callbacks?.onTransaction;
    this.onAnomaly = callbacks?.onAnomaly;
    this.onBudgetAlert = callbacks?.onBudgetAlert;
  }

  addTransactionListener(listener: (transaction: Transaction) => void) {
    this.transactionListeners.add(listener);
    return () => {
      this.transactionListeners.delete(listener);
    };
  }

  addAnomalyListener(listener: (anomaly: AnomalyResult) => void) {
    this.anomalyListeners.add(listener);
    return () => {
      this.anomalyListeners.delete(listener);
    };
  }

  addBudgetAlertListener(listener: (alert: BudgetAlert) => void) {
    this.budgetAlertListeners.add(listener);
    return () => {
      this.budgetAlertListeners.delete(listener);
    };
  }

  subscribe() {
    // Optional Kafka source: configure a server-side proxy that reads Kafka and emits SSE
    // Example env var: VITE_KAFKA_TRANSACTIONS_SSE_URL=https://your-api/transactions/stream
    const kafkaSseUrl = import.meta.env['VITE_KAFKA_TRANSACTIONS_SSE_URL'] as string | undefined;
    if (kafkaSseUrl) {
      this.subscribeKafkaSse(kafkaSseUrl);
      return;
    }

    // Subscribe to real-time transaction inserts
    this.channel = supabase
      .channel(`transactions:${this.userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${this.userId}`
        },
        async (payload) => {
          const transaction = payload.new as Transaction;
          await this.handleIncomingTransaction(transaction);
        }
      )
      .subscribe();
  }

  unsubscribe() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private emitTransaction(transaction: Transaction) {
    if (this.onTransaction) {
      this.onTransaction(transaction);
    }
    for (const listener of this.transactionListeners) {
      listener(transaction);
    }
  }

  private emitAnomaly(anomaly: AnomalyResult) {
    if (this.onAnomaly) {
      this.onAnomaly(anomaly);
    }
    for (const listener of this.anomalyListeners) {
      listener(anomaly);
    }
  }

  private emitBudgetAlert(alert: BudgetAlert) {
    if (this.onBudgetAlert) {
      this.onBudgetAlert(alert);
    }
    for (const listener of this.budgetAlertListeners) {
      listener(alert);
    }
  }

  private isLikelyTransaction(value: unknown): value is Transaction {
    if (!value || typeof value !== 'object') return false;
    const tx = value as Record<string, unknown>;
    return (
      typeof tx.id === 'string' &&
      typeof tx.user_id === 'string' &&
      typeof tx.transaction_date === 'string' &&
      typeof tx.category === 'string' &&
      (typeof tx.amount === 'number' || typeof tx.amount === 'string')
    );
  }

  private async handleIncomingTransaction(transaction: Transaction) {
    this.emitTransaction(transaction);
    await this.processTransaction(transaction);
  }

  private subscribeKafkaSse(url: string) {
    // Ensure we don't keep both sources active
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }

    const separator = url.includes('?') ? '&' : '?';
    const streamUrl = `${url}${separator}user_id=${encodeURIComponent(this.userId)}`;

    try {
      this.eventSource = new EventSource(streamUrl);
    } catch (error) {
      console.error('[TransactionPipeline] Failed to create EventSource:', error);
      return;
    }

    this.eventSource.onmessage = async (event) => {
      try {
        const raw = JSON.parse(event.data);
        const candidate = raw?.data ?? raw?.transaction ?? raw;

        if (!this.isLikelyTransaction(candidate)) {
          return;
        }

        if (candidate.user_id !== this.userId) {
          return;
        }

        // Normalize amount if it comes as string
        const normalized: Transaction = {
          ...(candidate as Transaction),
          amount: typeof (candidate as any).amount === 'string' ? Number((candidate as any).amount) : (candidate as any).amount
        };

        await this.handleIncomingTransaction(normalized);
      } catch {
        // Ignore malformed messages
      }
    };

    this.eventSource.onerror = (error) => {
      // Keep it non-fatal; the server may temporarily drop the connection.
      console.warn('[TransactionPipeline] Kafka SSE stream error:', error);
    };
  }

  private async processTransaction(transaction: Transaction) {
    // Step 1: Anomaly Detection
    const anomaly = await this.detectAnomaly(transaction);
    if (anomaly.isAnomaly) {
      this.emitAnomaly(anomaly);
    }

    // Step 2: Budget Monitoring
    const budgetAlert = await this.checkBudgetStatus(transaction);
    if (budgetAlert) {
      this.emitBudgetAlert(budgetAlert);
    }

    // Step 3: Update aggregated statistics (could be expanded)
    await this.updateStatistics(transaction);
  }

  private async detectAnomaly(transaction: Transaction): Promise<AnomalyResult> {
    // Fetch recent transactions for comparison
    const { data: recentTransactions } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', this.userId)
      .eq('category', transaction.category)
      .order('transaction_date', { ascending: false })
      .limit(50);

    if (!recentTransactions || recentTransactions.length < 10) {
      return {
        isAnomaly: false,
        severity: 'low',
        reason: 'Insufficient data for anomaly detection',
        transaction
      };
    }

    // Calculate statistics
    const amounts = recentTransactions.map((t: any) => parseFloat(t.amount));
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    const transactionAmount = parseFloat(transaction.amount.toString());
    const zScore = stdDev > 0 ? (transactionAmount - mean) / stdDev : 0;

    // Determine anomaly severity
    let isAnomaly = false;
    let severity: 'low' | 'medium' | 'high' = 'low';
    let reason = '';

    if (Math.abs(zScore) > 3) {
      isAnomaly = true;
      severity = 'high';
      reason = `Transaction amount (₹${transactionAmount}) is ${Math.abs(zScore).toFixed(1)} standard deviations from average (₹${mean.toFixed(2)})`;
    } else if (Math.abs(zScore) > 2) {
      isAnomaly = true;
      severity = 'medium';
      reason = `Transaction amount (₹${transactionAmount}) is significantly higher than usual for ${transaction.category}`;
    }

    return { isAnomaly, severity, reason, transaction };
  }

  private async checkBudgetStatus(transaction: Transaction): Promise<BudgetAlert | null> {
    // Get active budget
    const { data: budget } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', this.userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!budget) return null;

    // Calculate current month spending for this category
    const currentMonth = new Date().toISOString().slice(0, 7);
    const { data: monthTransactions } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', this.userId)
      .eq('category', transaction.category)
      .gte('transaction_date', `${currentMonth}-01`)
      .lte('transaction_date', `${currentMonth}-31`);

    const totalSpent = monthTransactions?.reduce((sum, t: any) => sum + parseFloat(t.amount), 0) || 0;
    const budgetValue = (budget as any)[transaction.category];
    const budgeted = parseFloat(budgetValue?.toString() || '0');

    if (budgeted === 0) return null;

    const percentUsed = (totalSpent / budgeted) * 100;

    // Trigger alerts at 80% and 100%
    if (percentUsed >= 100) {
      return {
        category: transaction.category,
        budgeted,
        spent: totalSpent,
        percentUsed,
        status: 'exceeded'
      };
    } else if (percentUsed >= 80) {
      return {
        category: transaction.category,
        budgeted,
        spent: totalSpent,
        percentUsed,
        status: 'warning'
      };
    }

    return null;
  }

  private async updateStatistics(transaction: Transaction) {
    // This could be expanded to update aggregated statistics tables
    // For now, we rely on real-time queries
    // Future: Could implement materialized views or summary tables
  }
}

/**
 * Real-time Budget Monitoring Pipeline
 * Monitors budget changes and spending patterns
 */
export class BudgetMonitoringPipeline implements ProcessingPipeline {
  private userId: string;
  private channel: any;
  public onBudgetUpdate?: (budget: Budget) => void;

  constructor(
    userId: string,
    callbacks?: {
      onBudgetUpdate?: (budget: Budget) => void;
    }
  ) {
    this.userId = userId;
    this.onBudgetUpdate = callbacks?.onBudgetUpdate;
  }

  subscribe() {
    this.channel = supabase
      .channel(`budgets:${this.userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budgets',
          filter: `user_id=eq.${this.userId}`
        },
        (payload) => {
          if (payload.new && this.onBudgetUpdate) {
            this.onBudgetUpdate(payload.new as Budget);
          }
        }
      )
      .subscribe();
  }

  unsubscribe() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
    }
  }
}

/**
 * Real-time Document Processing Pipeline
 * Monitors document uploads and processing status
 */
export class DocumentProcessingPipeline implements ProcessingPipeline {
  private userId: string;
  private channel: any;
  public onDocumentProcessed?: (documentId: string) => void;

  constructor(
    userId: string,
    callbacks?: {
      onDocumentProcessed?: (documentId: string) => void;
    }
  ) {
    this.userId = userId;
    this.onDocumentProcessed = callbacks?.onDocumentProcessed;
  }

  subscribe() {
    this.channel = supabase
      .channel(`documents:${this.userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'documents',
          filter: `user_id=eq.${this.userId}`
        },
        (payload) => {
          const doc = payload.new as any;
          if (doc.processed && this.onDocumentProcessed) {
            this.onDocumentProcessed(doc.id);
          }
        }
      )
      .subscribe();
  }

  unsubscribe() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
    }
  }
}

/**
 * Chat Streaming Pipeline
 * Handles real-time chat responses from AI
 */
export class ChatPipeline implements ProcessingPipeline {
  private userId: string;
  private eventSource: EventSource | null = null;
  private correlationId: string | null = null;
  private chunkListeners = new Set<(chunk: ChatChunk) => void>();
  private doneListeners = new Set<() => void>();
  private errorListeners = new Set<(error: string) => void>();
  public onChunk?: (text: string) => void;
  public onDone?: () => void;
  public onError?: (error: string) => void;

  constructor(
    userId: string,
    callbacks?: {
      onChunk?: (text: string) => void;
      onDone?: () => void;
      onError?: (error: string) => void;
    }
  ) {
    this.userId = userId;
    this.onChunk = callbacks?.onChunk;
    this.onDone = callbacks?.onDone;
    this.onError = callbacks?.onError;
  }

  addChunkListener(listener: (chunk: ChatChunk) => void) {
    this.chunkListeners.add(listener);
    return () => {
      this.chunkListeners.delete(listener);
    };
  }

  addDoneListener(listener: () => void) {
    this.doneListeners.add(listener);
    return () => {
      this.doneListeners.delete(listener);
    };
  }

  addErrorListener(listener: (error: string) => void) {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  subscribe(correlationId?: string) {
    const apiBaseUrl = import.meta.env['VITE_API_BASE_URL'] as string;
    if (!apiBaseUrl) {
      console.error('[ChatPipeline] VITE_API_BASE_URL not configured');
      return;
    }

    this.correlationId = correlationId || this.generateCorrelationId();
    const streamUrl = `${apiBaseUrl}/api/chat/stream?correlation_id=${this.correlationId}&user_id=${this.userId}`;

    try {
      this.eventSource = new EventSource(streamUrl);
    } catch (error) {
      console.error('[ChatPipeline] Failed to create EventSource:', error);
      return;
    }

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ChatChunk;
        
        if (data.event === 'chunk' && data.text) {
          if (this.onChunk) {
            this.onChunk(data.text);
          }
          for (const listener of this.chunkListeners) {
            listener(data);
          }
        } else if (data.event === 'done') {
          if (this.onDone) {
            this.onDone();
          }
          for (const listener of this.doneListeners) {
            listener();
          }
          this.unsubscribe();
        } else if (data.event === 'error' && data.error) {
          if (this.onError) {
            this.onError(data.error);
          }
          for (const listener of this.errorListeners) {
            listener(data.error);
          }
          this.unsubscribe();
        }
      } catch (error) {
        console.error('[ChatPipeline] Failed to parse message:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('[ChatPipeline] SSE error:', error);
      if (this.onError) {
        this.onError('Connection error');
      }
      for (const listener of this.errorListeners) {
        listener('Connection error');
      }
    };
  }

  unsubscribe() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.correlationId = null;
  }

  getCorrelationId(): string | null {
    return this.correlationId;
  }

  private generateCorrelationId(): string {
    return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Notification Pipeline
 * Handles real-time notifications
 */
export class NotificationPipeline implements ProcessingPipeline {
  private userId: string;
  private channel: any;
  private notificationListeners = new Set<(notification: Notification) => void>();
  public onNotification?: (notification: Notification) => void;

  constructor(
    userId: string,
    callbacks?: {
      onNotification?: (notification: Notification) => void;
    }
  ) {
    this.userId = userId;
    this.onNotification = callbacks?.onNotification;
  }

  addNotificationListener(listener: (notification: Notification) => void) {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  subscribe() {
    this.channel = supabase
      .channel(`notifications:${this.userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${this.userId}`
        },
        (payload) => {
          const notification = payload.new as Notification;
          if (this.onNotification) {
            this.onNotification(notification);
          }
          for (const listener of this.notificationListeners) {
            listener(notification);
          }
        }
      )
      .subscribe();
  }

  unsubscribe() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
    }
  }

  async fetchNotifications(limit: number = 50): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[NotificationPipeline] Failed to fetch notifications:', error);
      return [];
    }

    return data || [];
  }

  async fetchUnreadNotifications(): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', this.userId)
      .eq('is_read', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[NotificationPipeline] Failed to fetch unread notifications:', error);
      return [];
    }

    return data || [];
  }

  async markAsRead(notificationId: string): Promise<boolean> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', this.userId);

    if (error) {
      console.error('[NotificationPipeline] Failed to mark notification as read:', error);
      return false;
    }

    return true;
  }

  async markAllAsRead(): Promise<boolean> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', this.userId)
      .eq('is_read', false) as any;

    if (error) {
      console.error('[NotificationPipeline] Failed to mark all notifications as read:', error);
      return false;
    }

    return true;
  }
}

/**
 * Analytics Pipeline
 * Handles real-time analytics updates
 */
export class AnalyticsPipeline implements ProcessingPipeline {
  private userId: string;
  private channel: any;
  private analyticsListeners = new Set<(data: AnalyticsData) => void>();
  public onAnalyticsUpdate?: (data: AnalyticsData) => void;

  constructor(
    userId: string,
    callbacks?: {
      onAnalyticsUpdate?: (data: AnalyticsData) => void;
    }
  ) {
    this.userId = userId;
    this.onAnalyticsUpdate = callbacks?.onAnalyticsUpdate;
  }

  addAnalyticsListener(listener: (data: AnalyticsData) => void) {
    this.analyticsListeners.add(listener);
    return () => {
      this.analyticsListeners.delete(listener);
    };
  }

  subscribe() {
    // Subscribe to category spending updates
    this.channel = supabase
      .channel(`analytics:${this.userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'category_spending',
          filter: `user_id=eq.${this.userId}`
        },
        (payload) => {
          const data = payload.new as AnalyticsData;
          if (this.onAnalyticsUpdate) {
            this.onAnalyticsUpdate(data);
          }
          for (const listener of this.analyticsListeners) {
            listener(data);
          }
        }
      )
      .subscribe();
  }

  unsubscribe() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
    }
  }

  async fetchAnalytics(period?: string): Promise<AnalyticsData | null> {
    const targetPeriod = period || new Date().toISOString().slice(0, 7);

    const { data: categorySpending, error: csError } = await supabase
      .from('category_spending')
      .select('*')
      .eq('user_id', this.userId)
      .eq('period', targetPeriod);

    const { data: totalSpending, error: tsError } = await supabase
      .from('total_spending')
      .select('*')
      .eq('user_id', this.userId)
      .eq('period', targetPeriod)
      .maybeSingle();

    if (csError || tsError) {
      console.error('[AnalyticsPipeline] Failed to fetch analytics:', csError || tsError);
      return null;
    }

    const categorySpendingMap: Record<string, number> = {};
    categorySpending?.forEach((item: any) => {
      categorySpendingMap[item.category] = parseFloat(item.total_spent);
    });

    return {
      period: targetPeriod,
      total_spent: parseFloat(totalSpending?.total_spent || '0'),
      category_spending: categorySpendingMap,
      transaction_count: categorySpending?.length || 0,
    };
  }
}

/**
 * Unified Real-time Processing Manager
 * Manages all real-time pipelines for a user
 */
export class RealtimeProcessingManager {
  private transactionPipeline: TransactionPipeline;
  private budgetPipeline: BudgetMonitoringPipeline;
  private documentPipeline: DocumentProcessingPipeline;
  private chatPipeline: ChatPipeline | null = null;
  private notificationPipeline: NotificationPipeline | null = null;
  private analyticsPipeline: AnalyticsPipeline | null = null;

  constructor(userId: string) {
    this.transactionPipeline = new TransactionPipeline(userId);
    this.budgetPipeline = new BudgetMonitoringPipeline(userId);
    this.documentPipeline = new DocumentProcessingPipeline(userId);
  }

  startAll() {
    this.transactionPipeline.subscribe();
    this.budgetPipeline.subscribe();
    this.documentPipeline.subscribe();
    
    if (this.notificationPipeline) {
      this.notificationPipeline.subscribe();
    }
    
    if (this.analyticsPipeline) {
      this.analyticsPipeline.subscribe();
    }
  }

  stopAll() {
    this.transactionPipeline.unsubscribe();
    this.budgetPipeline.unsubscribe();
    this.documentPipeline.unsubscribe();
    
    if (this.chatPipeline) {
      this.chatPipeline.unsubscribe();
    }
    
    if (this.notificationPipeline) {
      this.notificationPipeline.unsubscribe();
    }
    
    if (this.analyticsPipeline) {
      this.analyticsPipeline.unsubscribe();
    }
  }

  getTransactionPipeline() {
    return this.transactionPipeline;
  }

  getBudgetPipeline() {
    return this.budgetPipeline;
  }

  getDocumentPipeline() {
    return this.documentPipeline;
  }

  getChatPipeline(callbacks?: {
    onChunk?: (text: string) => void;
    onDone?: () => void;
    onError?: (error: string) => void;
  }) {
    if (!this.chatPipeline) {
      this.chatPipeline = new ChatPipeline(
        this.transactionPipeline['userId'],
        callbacks
      );
    }
    return this.chatPipeline;
  }

  getNotificationPipeline(callbacks?: {
    onNotification?: (notification: Notification) => void;
  }) {
    if (!this.notificationPipeline) {
      // Get userId from transaction pipeline
      const userId = (this.transactionPipeline as any).userId;
      this.notificationPipeline = new NotificationPipeline(userId, callbacks);
      this.notificationPipeline.subscribe();
    }
    return this.notificationPipeline;
  }

  getAnalyticsPipeline(callbacks?: {
    onAnalyticsUpdate?: (data: AnalyticsData) => void;
  }) {
    if (!this.analyticsPipeline) {
      const userId = (this.transactionPipeline as any).userId;
      this.analyticsPipeline = new AnalyticsPipeline(userId, callbacks);
      this.analyticsPipeline.subscribe();
    }
    return this.analyticsPipeline;
  }
}
