-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Admins have full access to profiles" ON public.profiles
  FOR ALL TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK (role IS NOT DISTINCT FROM (SELECT role FROM profiles WHERE id = auth.uid()));

-- Income records policies
CREATE POLICY "Users can manage their own income records" ON public.income_records
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- Budgets policies
CREATE POLICY "Users can manage their own budgets" ON public.budgets
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- Documents policies
CREATE POLICY "Users can manage their own documents" ON public.documents
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- Transactions policies
CREATE POLICY "Users can manage their own transactions" ON public.transactions
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- Chat history policies
CREATE POLICY "Users can manage their own chat history" ON public.chat_history
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- Alerts policies
CREATE POLICY "Users can manage their own alerts" ON public.alerts
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- Create storage bucket for document uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-9hnntffjcnb5_documents_images',
  'app-9hnntffjcnb5_documents_images',
  true,
  1048576,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
);

-- Storage policies for document uploads
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'app-9hnntffjcnb5_documents_images');

CREATE POLICY "Users can view their own documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'app-9hnntffjcnb5_documents_images');

CREATE POLICY "Users can delete their own documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'app-9hnntffjcnb5_documents_images');