import { supabase } from './supabase';
import { getApiBaseUrl, backendJson } from '@/lib/backend-api';
import type {
  Profile,
  IncomeRecord,
  Budget,
  Document,
  Transaction,
  ChatMessage,
  Alert,
  TransactionCategory,
  UserMode
} from '@/types';

const LOCAL_AUTH_ACCOUNTS_KEY = 'rupeewise.localAuth.accounts';
const LOCAL_INCOME_PREFIX = 'rupeewise.localData.income.';
const LOCAL_CHAT_PREFIX = 'rupeewise.localData.chat.';
const LOCAL_BUDGET_PREFIX = 'rupeewise.localData.budget.';
const LOCAL_TX_PREFIX = 'rupeewise.localData.transactions.';
const LOCAL_ALERT_PREFIX = 'rupeewise.localData.alerts.';

type LocalAuthAccount = {
  userId: string;
  username: string;
  email: string;
  password: string;
  userMode?: UserMode;
  createdAt: string;
};

function isLocalUserId(userId: string): boolean {
  return userId.startsWith('local-');
}

function readLocalAccounts(): LocalAuthAccount[] {
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalAuthAccount[]) : [];
  } catch {
    return [];
  }
}

function writeLocalAccounts(accounts: LocalAuthAccount[]): void {
  localStorage.setItem(LOCAL_AUTH_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function updateLocalAccount(userId: string, updater: (account: LocalAuthAccount) => LocalAuthAccount): void {
  const accounts = readLocalAccounts();
  const index = accounts.findIndex((account) => account.userId === userId);
  if (index === -1) return;
  accounts[index] = updater(accounts[index]);
  writeLocalAccounts(accounts);
}

function readLocalCollection<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeLocalCollection<T>(key: string, value: T[]): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function getIncomeStorageKey(userId: string): string {
  return `${LOCAL_INCOME_PREFIX}${userId}`;
}

function getChatStorageKey(userId: string): string {
  return `${LOCAL_CHAT_PREFIX}${userId}`;
}

function getBudgetStorageKey(userId: string): string {
  return `${LOCAL_BUDGET_PREFIX}${userId}`;
}

function getTransactionStorageKey(userId: string): string {
  return `${LOCAL_TX_PREFIX}${userId}`;
}

function getAlertStorageKey(userId: string): string {
  return `${LOCAL_ALERT_PREFIX}${userId}`;
}

function getPeriodBounds(period: Budget['period'], dateValue: string): { start: string; end: string } {
  const when = new Date(dateValue || new Date().toISOString());
  if (period === 'yearly') {
    const start = new Date(when.getFullYear(), 0, 1);
    const end = new Date(when.getFullYear(), 11, 31);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  }

  const start = new Date(when.getFullYear(), when.getMonth(), 1);
  const end = new Date(when.getFullYear(), when.getMonth() + 1, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  };
}

function sortByCreatedAtDesc<T extends { created_at: string }>(records: T[]): T[] {
  return records.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function createLocalBudgetAlertForTransaction(transaction: Transaction): void {
  if (!isLocalUserId(transaction.user_id)) return;

  const budgets = readLocalCollection<Budget>(getBudgetStorageKey(transaction.user_id));
  const activeBudget = sortByCreatedAtDesc(budgets).find((budget) => budget.is_active);
  if (!activeBudget) return;

  const allocated = Number(activeBudget[transaction.category as keyof Budget] || 0);
  if (allocated <= 0) return;

  const { start, end } = getPeriodBounds(activeBudget.period, transaction.transaction_date);
  const txs = readLocalCollection<Transaction>(getTransactionStorageKey(transaction.user_id));
  const spent = txs
    .filter((tx) => tx.category === transaction.category)
    .filter((tx) => tx.transaction_date >= start && tx.transaction_date <= end)
    .reduce((sum, tx) => sum + Number(tx.amount), 0);

  const prevSpent = Math.max(0, spent - Number(transaction.amount));
  const percent = (spent / allocated) * 100;
  const prevPercent = (prevSpent / allocated) * 100;

  let alertType: Alert['alert_type'] | null = null;
  if (prevPercent < 100 && percent >= 100) {
    alertType = 'budget_exceeded';
  } else if (prevPercent < 80 && percent >= 80) {
    alertType = 'budget_80';
  }

  if (!alertType) return;

  const alerts = readLocalCollection<Alert>(getAlertStorageKey(transaction.user_id));
  const exists = alerts.some(
    (alert) =>
      alert.alert_type === alertType &&
      alert.category === transaction.category &&
      alert.created_at >= `${start}T00:00:00.000Z`
  );
  if (exists) return;

  const message =
    alertType === 'budget_exceeded'
      ? `You've exceeded your ${transaction.category} budget (₹${spent.toFixed(2)} / ₹${allocated.toFixed(2)}).`
      : `You've used ${percent.toFixed(0)}% of your ${transaction.category} budget (₹${spent.toFixed(2)} / ₹${allocated.toFixed(2)}).`;

  const nextAlerts = sortByCreatedAtDesc([
    ...alerts,
    {
      id: createLocalRecordId(),
      user_id: transaction.user_id,
      alert_type: alertType,
      category: transaction.category,
      message,
      is_read: false,
      created_at: new Date().toISOString()
    }
  ]);

  writeLocalCollection(getAlertStorageKey(transaction.user_id), nextAlerts);
}

function createLocalRecordId(): string {
  return `local-${crypto.randomUUID()}`;
}

// Profile operations
export const getProfile = async (userId: string) => {
  if (isLocalUserId(userId)) {
    const account = readLocalAccounts().find((item) => item.userId === userId);
    if (!account) return null;
    const now = new Date().toISOString();
    return {
      id: account.userId,
      email: account.email,
      username: account.username,
      role: 'user',
      user_mode: account.userMode ?? 'personal',
      created_at: account.createdAt,
      updated_at: now
    } as Profile;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  
  if (error) throw error;
  return data as Profile | null;
};

export const updateProfile = async (userId: string, updates: Partial<Profile>) => {
  if (isLocalUserId(userId)) {
    let profile: Profile | null = null;
    updateLocalAccount(userId, (account) => {
      const updatedAccount = {
        ...account,
        userMode: updates.user_mode ?? account.userMode
      };
      profile = {
        id: updatedAccount.userId,
        email: updatedAccount.email,
        username: updatedAccount.username,
        role: 'user',
        user_mode: updatedAccount.userMode ?? 'personal',
        created_at: updatedAccount.createdAt,
        updated_at: new Date().toISOString()
      };
      return updatedAccount;
    });

    if (!profile) {
      throw new Error('Local profile not found');
    }

    return profile;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .maybeSingle();
  
  if (error) throw error;
  return data as Profile;
};

export const updateUserMode = async (userId: string, mode: UserMode) => {
  return updateProfile(userId, { user_mode: mode });
};

// Income operations
export const getIncomeRecords = async (userId: string) => {
  if (isLocalUserId(userId)) {
    return readLocalCollection<IncomeRecord>(getIncomeStorageKey(userId));
  }

  const { data, error } = await supabase
    .from('income_records')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return Array.isArray(data) ? data as IncomeRecord[] : [];
};

export const createIncomeRecord = async (record: Omit<IncomeRecord, 'id' | 'created_at' | 'updated_at'>) => {
  if (isLocalUserId(record.user_id)) {
    const now = new Date().toISOString();
    const createdRecord: IncomeRecord = {
      ...record,
      id: createLocalRecordId(),
      created_at: now,
      updated_at: now
    };
    const records = readLocalCollection<IncomeRecord>(getIncomeStorageKey(record.user_id));
    records.unshift(createdRecord);
    writeLocalCollection(getIncomeStorageKey(record.user_id), records);
    return createdRecord;
  }

  const { data, error } = await supabase
    .from('income_records')
    .insert(record)
    .select()
    .maybeSingle();
  
  if (error) throw error;
  return data as IncomeRecord;
};

export const deleteIncomeRecord = async (id: string) => {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(LOCAL_INCOME_PREFIX)) continue;
    const records = readLocalCollection<IncomeRecord>(key);
    const nextRecords = records.filter((record) => record.id !== id);
    if (nextRecords.length !== records.length) {
      writeLocalCollection(key, nextRecords);
      return;
    }
  }

  const { error } = await supabase
    .from('income_records')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

export const getTotalIncome = async (userId: string): Promise<number> => {
  const records = await getIncomeRecords(userId);
  return records.reduce((sum, record) => sum + Number(record.amount), 0);
};

// Budget operations
export const getActiveBudget = async (userId: string) => {
  if (isLocalUserId(userId)) {
    const budgets = readLocalCollection<Budget>(getBudgetStorageKey(userId));
    return sortByCreatedAtDesc(budgets).find((budget) => budget.is_active) ?? null;
  }

  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error) throw error;
  return data as Budget | null;
};

export const getAllBudgets = async (userId: string) => {
  if (isLocalUserId(userId)) {
    const budgets = readLocalCollection<Budget>(getBudgetStorageKey(userId));
    return sortByCreatedAtDesc(budgets);
  }

  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return Array.isArray(data) ? data as Budget[] : [];
};

export const createBudget = async (budget: Omit<Budget, 'id' | 'created_at' | 'updated_at'>) => {
  if (isLocalUserId(budget.user_id)) {
    const now = new Date().toISOString();
    const budgets = readLocalCollection<Budget>(getBudgetStorageKey(budget.user_id)).map((item) => ({
      ...item,
      is_active: false,
      updated_at: now
    }));

    const createdBudget: Budget = {
      ...budget,
      id: createLocalRecordId(),
      created_at: now,
      updated_at: now
    };

    budgets.unshift(createdBudget);
    writeLocalCollection(getBudgetStorageKey(budget.user_id), budgets);
    return createdBudget;
  }

  // Deactivate existing budgets
  const { error: deactivateError } = await supabase
    .from('budgets')
    .update({ is_active: false })
    .eq('user_id', budget.user_id);

  if (deactivateError) throw deactivateError;

  const { data, error } = await supabase
    .from('budgets')
    .insert(budget)
    .select()
    .maybeSingle();
  
  if (error) throw error;
  return data as Budget;
};

export const updateBudget = async (id: string, updates: Partial<Budget>) => {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(LOCAL_BUDGET_PREFIX)) continue;
    const budgets = readLocalCollection<Budget>(key);
    const index = budgets.findIndex((budget) => budget.id === id);
    if (index === -1) continue;

    const updatedBudget: Budget = {
      ...budgets[index],
      ...updates,
      updated_at: new Date().toISOString()
    };
    budgets[index] = updatedBudget;
    writeLocalCollection(key, budgets);
    return updatedBudget;
  }

  const { data, error } = await supabase
    .from('budgets')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  
  if (error) throw error;
  return data as Budget;
};

// Document operations
export const getDocuments = async (userId: string) => {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return Array.isArray(data) ? data as Document[] : [];
};

export const createDocument = async (doc: Omit<Document, 'id' | 'created_at'>) => {
  const { data, error } = await supabase
    .from('documents')
    .insert(doc)
    .select()
    .maybeSingle();
  
  if (error) throw error;
  return data as Document;
};

// Transaction operations
export const getTransactions = async (userId: string, limit?: number) => {
  if (isLocalUserId(userId)) {
    const txs = sortByCreatedAtDesc(readLocalCollection<Transaction>(getTransactionStorageKey(userId)));
    return limit ? txs.slice(0, limit) : txs;
  }

  let query = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false });
  
  if (limit) {
    query = query.limit(limit);
  }
  
  const { data, error } = await query;
  
  if (error) throw error;
  return Array.isArray(data) ? data as Transaction[] : [];
};

export const getTransactionsByCategory = async (userId: string, category: TransactionCategory) => {
  if (isLocalUserId(userId)) {
    return sortByCreatedAtDesc(
      readLocalCollection<Transaction>(getTransactionStorageKey(userId)).filter(
        (tx) => tx.category === category
      )
    );
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('category', category)
    .order('transaction_date', { ascending: false });
  
  if (error) throw error;
  return Array.isArray(data) ? data as Transaction[] : [];
};

export const getTransactionsByDateRange = async (userId: string, startDate: string, endDate: string) => {
  if (isLocalUserId(userId)) {
    return sortByCreatedAtDesc(
      readLocalCollection<Transaction>(getTransactionStorageKey(userId)).filter(
        (tx) => tx.transaction_date >= startDate && tx.transaction_date <= endDate
      )
    );
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate)
    .order('transaction_date', { ascending: false });
  
  if (error) throw error;
  return Array.isArray(data) ? data as Transaction[] : [];
};

export const createTransaction = async (transaction: Omit<Transaction, 'id' | 'created_at'>) => {
  if (isLocalUserId(transaction.user_id)) {
    const now = new Date().toISOString();
    const createdTransaction: Transaction = {
      ...transaction,
      id: createLocalRecordId(),
      created_at: now
    };
    const txs = readLocalCollection<Transaction>(getTransactionStorageKey(transaction.user_id));
    txs.unshift(createdTransaction);
    writeLocalCollection(getTransactionStorageKey(transaction.user_id), txs);
    createLocalBudgetAlertForTransaction(createdTransaction);
    return createdTransaction;
  }

  // Try backend API first, fall back to Supabase if it fails
  if (getApiBaseUrl()) {
    try {
      return await backendJson<Transaction>('/api/transactions/create', {
        method: 'POST',
        body: transaction
      });
    } catch (backendError) {
      console.warn('Backend API failed, falling back to Supabase:', backendError);
      // Fall through to Supabase
    }
  }

  // Use Supabase as fallback
  const { data, error } = await supabase
    .from('transactions')
    .insert(transaction)
    .select()
    .maybeSingle();
  
  if (error) throw error;
  return data as Transaction;
};

export const deleteTransaction = async (id: string) => {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(LOCAL_TX_PREFIX)) continue;
    const txs = readLocalCollection<Transaction>(key);
    const nextTxs = txs.filter((tx) => tx.id !== id);
    if (nextTxs.length !== txs.length) {
      writeLocalCollection(key, nextTxs);
      return;
    }
  }

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

// Chat history operations
export const getChatHistory = async (userId: string, limit = 50) => {
  if (isLocalUserId(userId)) {
    const history = readLocalCollection<ChatMessage>(getChatStorageKey(userId));
    return history.slice(-limit);
  }

  const { data, error } = await supabase
    .from('chat_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return Array.isArray(data) ? (data as ChatMessage[]).reverse() : [];
};

export const createChatMessage = async (message: Omit<ChatMessage, 'id' | 'created_at'>) => {
  if (isLocalUserId(message.user_id)) {
    const now = new Date().toISOString();
    const createdMessage: ChatMessage = {
      ...message,
      id: createLocalRecordId(),
      created_at: now
    };
    const history = readLocalCollection<ChatMessage>(getChatStorageKey(message.user_id));
    history.push(createdMessage);
    writeLocalCollection(getChatStorageKey(message.user_id), history);
    return createdMessage;
  }

  const { data, error } = await supabase
    .from('chat_history')
    .insert(message)
    .select()
    .maybeSingle();
  
  if (error) throw error;
  return data as ChatMessage;
};

export const clearChatHistory = async (userId: string) => {
  if (isLocalUserId(userId)) {
    writeLocalCollection<ChatMessage>(getChatStorageKey(userId), []);
    return;
  }

  const { error } = await supabase
    .from('chat_history')
    .delete()
    .eq('user_id', userId);
  
  if (error) throw error;
};

// Alert operations
export const getAlerts = async (userId: string, unreadOnly = false) => {
  if (isLocalUserId(userId)) {
    const alerts = sortByCreatedAtDesc(readLocalCollection<Alert>(getAlertStorageKey(userId)));
    return unreadOnly ? alerts.filter((alert) => !alert.is_read) : alerts;
  }

  let query = supabase
    .from('alerts')
    .select('*')
    .eq('user_id', userId);
  
  if (unreadOnly) {
    query = query.eq('is_read', false);
  }
  
  query = query.order('created_at', { ascending: false });
  
  const { data, error } = await query;
  
  if (error) throw error;
  return Array.isArray(data) ? data as Alert[] : [];
};

export const createAlert = async (alert: Omit<Alert, 'id' | 'created_at'>) => {
  if (isLocalUserId(alert.user_id)) {
    const createdAlert: Alert = {
      ...alert,
      id: createLocalRecordId(),
      created_at: new Date().toISOString()
    };
    const alerts = readLocalCollection<Alert>(getAlertStorageKey(alert.user_id));
    alerts.unshift(createdAlert);
    writeLocalCollection(getAlertStorageKey(alert.user_id), alerts);
    return createdAlert;
  }

  const { data, error } = await supabase
    .from('alerts')
    .insert(alert)
    .select()
    .maybeSingle();
  
  if (error) throw error;
  return data as Alert;
};

export const markAlertAsRead = async (id: string) => {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(LOCAL_ALERT_PREFIX)) continue;
    const alerts = readLocalCollection<Alert>(key);
    const index = alerts.findIndex((alert) => alert.id === id);
    if (index === -1) continue;
    alerts[index] = { ...alerts[index], is_read: true };
    writeLocalCollection(key, alerts);
    return;
  }

  const { error } = await supabase
    .from('alerts')
    .update({ is_read: true })
    .eq('id', id);
  
  if (error) throw error;
};

export const markAllAlertsAsRead = async (userId: string) => {
  if (isLocalUserId(userId)) {
    const alerts = readLocalCollection<Alert>(getAlertStorageKey(userId)).map((alert) => ({
      ...alert,
      is_read: true
    }));
    writeLocalCollection(getAlertStorageKey(userId), alerts);
    return;
  }

  const { error } = await supabase
    .from('alerts')
    .update({ is_read: true })
    .eq('user_id', userId);
  
  if (error) throw error;
};

// Spending analytics
export const getCurrentMonthSpending = async (userId: string) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  
  return getTransactionsByDateRange(userId, startOfMonth, endOfMonth);
};

export const getSpendingByCategory = async (userId: string, startDate: string, endDate: string) => {
  const transactions = await getTransactionsByDateRange(userId, startDate, endDate);
  
  const spending: Record<string, number> = {};
  transactions.forEach((t) => {
    spending[t.category] = (spending[t.category] || 0) + Number(t.amount);
  });
  
  return spending;
};
