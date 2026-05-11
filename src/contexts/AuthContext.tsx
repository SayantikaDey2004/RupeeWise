import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/db/supabase';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/types';

const LOCAL_AUTH_ACCOUNTS_KEY = 'rupeewise.localAuth.accounts';
const LOCAL_AUTH_SESSION_KEY = 'rupeewise.localAuth.session';

type LocalAuthAccount = {
  userId: string;
  username: string;
  email: string;
  password: string;
  userMode?: Profile['user_mode'];
  createdAt: string;
};

function isLocalUser(user: User | null): boolean {
  return Boolean(user?.id?.startsWith('local-'));
}

function isAuthNetworkError(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message ?? error ?? '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('dns')
  );
}

function toLocalUser(account: LocalAuthAccount): User {
  return {
    id: account.userId,
    email: account.email,
    app_metadata: {},
    user_metadata: { username: account.username, localAuth: true },
    aud: 'authenticated',
    created_at: account.createdAt
  } as User;
}

function toLocalProfile(account: LocalAuthAccount): Profile {
  const now = new Date().toISOString();
  return {
    id: account.userId,
    email: account.email,
    username: account.username,
    role: 'user',
    user_mode: account.userMode ?? 'personal',
    created_at: account.createdAt,
    updated_at: now
  };
}

function readLocalAccounts(): LocalAuthAccount[] {
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalAccounts(accounts: LocalAuthAccount[]): void {
  localStorage.setItem(LOCAL_AUTH_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function readLocalSessionUserId(): string | null {
  return localStorage.getItem(LOCAL_AUTH_SESSION_KEY);
}

function writeLocalSessionUserId(userId: string): void {
  localStorage.setItem(LOCAL_AUTH_SESSION_KEY, userId);
}

function clearLocalSessionUserId(): void {
  localStorage.removeItem(LOCAL_AUTH_SESSION_KEY);
}

export async function getProfile(userId: string): Promise<Profile | null> {
  if (userId.startsWith('local-')) {
    const account = readLocalAccounts().find((item) => item.userId === userId);
    return account ? toLocalProfile(account) : null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('获取用户信息失败:', error);
    return null;
  }
  return data;
}
interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signInWithUsername: (username: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithUsername: (username: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!user) {
      setProfile(null);
      return;
    }

    const profileData = await getProfile(user.id);
    setProfile(profileData);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const sessionUser = session?.user ?? null;
      if (sessionUser) {
        setUser(sessionUser);
        getProfile(sessionUser.id).then(setProfile);
      } else {
        const localSessionUserId = readLocalSessionUserId();
        const localAccount = localSessionUserId
          ? readLocalAccounts().find((item) => item.userId === localSessionUserId)
          : undefined;
        if (localAccount) {
          setUser(toLocalUser(localAccount));
          setProfile(toLocalProfile(localAccount));
        }
      }
      setLoading(false);
    }).catch(() => {
      const localSessionUserId = readLocalSessionUserId();
      const localAccount = localSessionUserId
        ? readLocalAccounts().find((item) => item.userId === localSessionUserId)
        : undefined;
      if (localAccount) {
        setUser(toLocalUser(localAccount));
        setProfile(toLocalProfile(localAccount));
      }
      setLoading(false);
    });
    // In this function, do NOT use any await calls. Use `.then()` instead to avoid deadlocks.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        getProfile(session.user.id).then(setProfile);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithUsername = async (username: string, password: string) => {
    try {
      const email = `${username}@miaoda.com`;
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { error: null };
    } catch (error) {
      if (isAuthNetworkError(error)) {
        const account = readLocalAccounts().find(
          (item) => item.username === username && item.password === password
        );
        if (!account) {
          return {
            error: new Error('Supabase is unreachable and no local account was found. Sign up first in local mode.')
          };
        }
        setUser(toLocalUser(account));
        setProfile(toLocalProfile(account));
        writeLocalSessionUserId(account.userId);
        return { error: null };
      }
      return { error: error as Error };
    }
  };

  const signUpWithUsername = async (username: string, password: string) => {
    try {
      const email = `${username}@miaoda.com`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;
      return { error: null };
    } catch (error) {
      if (isAuthNetworkError(error)) {
        const existing = readLocalAccounts().find((item) => item.username === username);
        if (existing) {
          return { error: new Error('Username already exists in local mode. Please sign in instead.') };
        }

        const account: LocalAuthAccount = {
          userId: `local-${crypto.randomUUID()}`,
          username,
          email: `${username}@miaoda.com`,
          password,
          userMode: 'personal',
          createdAt: new Date().toISOString()
        };

        const accounts = readLocalAccounts();
        accounts.push(account);
        writeLocalAccounts(accounts);
        writeLocalSessionUserId(account.userId);
        setUser(toLocalUser(account));
        setProfile(toLocalProfile(account));
        return { error: null };
      }
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    if (!isLocalUser(user)) {
      await supabase.auth.signOut();
    }
    clearLocalSessionUserId();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signInWithUsername, signUpWithUsername, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
