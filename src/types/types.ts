// Database types
export type UserRole = 'user' | 'admin';
export type UserMode = 'personal' | 'family';
export type TransactionCategory =
  | 'rent'
  | 'groceries'
  | 'transport'
  | 'entertainment'
  | 'savings'
  | 'emergency_fund'
  | 'utilities'
  | 'healthcare'
  | 'education'
  | 'dining'
  | 'shopping'
  | 'other';
export type BudgetPeriod = 'monthly' | 'yearly';
export type AlertType = 'budget_80' | 'budget_exceeded' | 'unusual_spike' | 'info';

export interface Profile {
  id: string;
  email: string | null;
  username: string;
  role: UserRole;
  user_mode: UserMode;
  created_at: string;
  updated_at: string;
}

export interface IncomeRecord {
  id: string;
  user_id: string;
  member_name: string;
  amount: number;
  period: BudgetPeriod;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  period: BudgetPeriod;
  total_income: number;
  rent: number;
  groceries: number;
  transport: number;
  entertainment: number;
  savings: number;
  emergency_fund: number;
  utilities: number;
  healthcare: number;
  education: number;
  dining: number;
  shopping: number;
  other: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  ocr_text: string | null;
  processed: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  document_id: string | null;
  amount: number;
  transaction_date: string;
  merchant: string | null;
  category: TransactionCategory;
  description: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  role: 'user' | 'model';
  message: string;
  created_at: string;
}

export interface Alert {
  id: string;
  user_id: string;
  alert_type: AlertType;
  category: TransactionCategory | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

// UI types
export interface BudgetAllocation {
  category: TransactionCategory;
  allocated: number;
  spent: number;
  percentage: number;
}

export interface SpendingSummary {
  totalIncome: number;
  totalSpent: number;
  totalBudgeted: number;
  remaining: number;
  byCategory: Record<TransactionCategory, number>;
}

export interface ChatStreamResponse {
  text: string;
}

export interface OCRProcessResponse {
  success: boolean;
  extractedText: string;
  transactions: Array<{
    amount: number;
    date: string;
    merchant: string;
    category: TransactionCategory;
    description: string;
  }>;
  transactionCount: number;
}

export interface BudgetSuggestion {
  rent: number;
  groceries: number;
  transport: number;
  entertainment: number;
  savings: number;
  emergency_fund: number;
  utilities: number;
  healthcare: number;
  education: number;
  dining: number;
  shopping: number;
  other: number;
}

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  rent: 'Rent',
  groceries: 'Groceries',
  transport: 'Transport',
  entertainment: 'Entertainment',
  savings: 'Savings',
  emergency_fund: 'Emergency Fund',
  utilities: 'Utilities',
  healthcare: 'Healthcare',
  education: 'Education',
  dining: 'Dining',
  shopping: 'Shopping',
  other: 'Other'
};

export const CATEGORY_ICONS: Record<TransactionCategory, string> = {
  rent: '🏠',
  groceries: '🛒',
  transport: '🚗',
  entertainment: '🎬',
  savings: '💰',
  emergency_fund: '🚨',
  utilities: '💡',
  healthcare: '⚕️',
  education: '📚',
  dining: '🍽️',
  shopping: '🛍️',
  other: '📦'
};
