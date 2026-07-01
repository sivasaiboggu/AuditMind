import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';

interface User {
  id: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  sendOTP: (email: string) => Promise<void>;
  verifyOTP: (email: string, code: string) => Promise<void>;
  loginBypass: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync Supabase Auth State
  useEffect(() => {
    if (!supabase) {
      // Fallback local mock user load
      const savedUser = localStorage.getItem('auditmind_user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
      setLoading(false);
      return;
    }

    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        syncProfile(session.user);
      } else {
        const savedUser = localStorage.getItem('auditmind_user');
        if (savedUser) {
          setUser(JSON.parse(savedUser));
        }
      }
      setLoading(false);
    });

    // 2. Subscribe to auth state updates
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await syncProfile(session.user);
      } else {
        const savedUser = localStorage.getItem('auditmind_user');
        if (!savedUser) {
          setUser(null);
        }
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const syncProfile = async (supabaseUser: any) => {
    try {
      const { data } = await supabase!
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();
        
      if (data) {
        setUser({
          id: supabaseUser.id,
          email: supabaseUser.email || '',
          fullName: data.full_name || '',
          avatarUrl: data.avatar_url || ''
        });
      } else {
        setUser({
          id: supabaseUser.id,
          email: supabaseUser.email || '',
          fullName: supabaseUser.user_metadata?.full_name || '',
          avatarUrl: supabaseUser.user_metadata?.avatar_url || ''
        });
      }
    } catch (e) {
      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        fullName: supabaseUser.user_metadata?.full_name || '',
        avatarUrl: supabaseUser.user_metadata?.avatar_url || ''
      });
    }
  };

  const loginWithGoogle = async () => {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/dashboard'
      }
    });
    if (error) throw error;
  };

  const sendOTP = async (email: string) => {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true
      }
    });
    if (error) throw error;
  };

  const verifyOTP = async (email: string, code: string) => {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email'
    });
    if (error) throw error;
    if (data.user) {
      await syncProfile(data.user);
    }
  };

  const loginBypass = async (email: string) => {
    const mockUser: User = {
      id: '00000000-0000-0000-0000-000000000000',
      email,
      fullName: 'Demo Analyst',
      avatarUrl: ''
    };
    setUser(mockUser);
    localStorage.setItem('auditmind_user', JSON.stringify(mockUser));
  };

  const logout = async () => {
    localStorage.removeItem('auditmind_user');
    setUser(null);
    if (supabase) {
      await supabase.auth.signOut();
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, sendOTP, verifyOTP, loginBypass, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
