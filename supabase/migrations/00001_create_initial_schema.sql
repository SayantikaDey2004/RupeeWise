-- Create user role enum
CREATE TYPE public.user_role AS ENUM ('user', 'admin');

-- Create user mode enum (Personal or Family)
CREATE TYPE public.user_mode AS ENUM ('personal', 'family');

-- Create transaction category enum
CREATE TYPE public.transaction_category AS ENUM (
  'rent', 'groceries', 'transport', 'entertainment', 
  'savings', 'emergency_fund', 'utilities', 'healthcare', 
  'education', 'dining', 'shopping', 'other'
);

-- Create budget period enum
CREATE TYPE public.budget_period AS ENUM ('monthly', 'yearly');

-- Create alert type enum
CREATE TYPE public.alert_type AS ENUM ('budget_80', 'budget_exceeded', 'unusual_spike', 'info');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  username TEXT UNIQUE NOT NULL,
  role public.user_role DEFAULT 'user'::public.user_role NOT NULL,
  user_mode public.user_mode DEFAULT 'personal'::public.user_mode NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create income_records table
CREATE TABLE public.income_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  member_name TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
  period public.budget_period DEFAULT 'monthly'::public.budget_period NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create budgets table
CREATE TABLE public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  period public.budget_period NOT NULL,
  total_income DECIMAL(12, 2) NOT NULL CHECK (total_income >= 0),
  rent DECIMAL(12, 2) DEFAULT 0 CHECK (rent >= 0),
  groceries DECIMAL(12, 2) DEFAULT 0 CHECK (groceries >= 0),
  transport DECIMAL(12, 2) DEFAULT 0 CHECK (transport >= 0),
  entertainment DECIMAL(12, 2) DEFAULT 0 CHECK (entertainment >= 0),
  savings DECIMAL(12, 2) DEFAULT 0 CHECK (savings >= 0),
  emergency_fund DECIMAL(12, 2) DEFAULT 0 CHECK (emergency_fund >= 0),
  utilities DECIMAL(12, 2) DEFAULT 0 CHECK (utilities >= 0),
  healthcare DECIMAL(12, 2) DEFAULT 0 CHECK (healthcare >= 0),
  education DECIMAL(12, 2) DEFAULT 0 CHECK (education >= 0),
  dining DECIMAL(12, 2) DEFAULT 0 CHECK (dining >= 0),
  shopping DECIMAL(12, 2) DEFAULT 0 CHECK (shopping >= 0),
  other DECIMAL(12, 2) DEFAULT 0 CHECK (other >= 0),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create documents table
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  ocr_text TEXT,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
  transaction_date DATE NOT NULL,
  merchant TEXT,
  category public.transaction_category NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create chat_history table
CREATE TABLE public.chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'model')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create alerts table
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  alert_type public.alert_type NOT NULL,
  category public.transaction_category,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_income_records_user_id ON public.income_records(user_id);
CREATE INDEX idx_budgets_user_id ON public.budgets(user_id);
CREATE INDEX idx_budgets_active ON public.budgets(user_id, is_active);
CREATE INDEX idx_documents_user_id ON public.documents(user_id);
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_date ON public.transactions(user_id, transaction_date DESC);
CREATE INDEX idx_transactions_category ON public.transactions(user_id, category);
CREATE INDEX idx_chat_history_user_id ON public.chat_history(user_id, created_at DESC);
CREATE INDEX idx_alerts_user_id ON public.alerts(user_id, is_read, created_at DESC);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_income_records_updated_at BEFORE UPDATE ON public.income_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create user sync function
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM profiles;
  
  INSERT INTO public.profiles (id, email, username, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    CASE WHEN user_count = 0 THEN 'admin'::public.user_role ELSE 'user'::public.user_role END
  );
  RETURN NEW;
END;
$$;

-- Create trigger for user sync
DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL)
  EXECUTE FUNCTION handle_new_user();

-- Create helper function to check admin
CREATE OR REPLACE FUNCTION is_admin(uid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = uid AND p.role = 'admin'::user_role
  );
$$;