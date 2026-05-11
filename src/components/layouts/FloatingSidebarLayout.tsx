import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  IndianRupee,
  Target,
  Upload,
  Receipt,
  Settings,
  LogOut,
  Sparkles,
  Menu,
  User
} from 'lucide-react';

interface FloatingSidebarLayoutProps {
  children: React.ReactNode;
}

export default function FloatingSidebarLayout({ children }: FloatingSidebarLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/chat', icon: MessageSquare, label: 'AI Chat' },
    { path: '/income', icon: IndianRupee, label: 'Income' },
    { path: '/budget', icon: Target, label: 'Budget' },
    { path: '/documents', icon: Upload, label: 'Documents' },
    { path: '/transactions', icon: Receipt, label: 'Transactions' },
    { path: '/settings', icon: Settings, label: 'Settings' }
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleMenuItemClick = (path: string) => {
    setMobileMenuOpen(false);
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-background gradient-bg-1">
      {/* Mobile Header with Hamburger Menu */}
      <header className="fixed top-0 left-0 right-0 lg:hidden glass-effect border-b border-border/50 z-50">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground shadow-lg">
              <Sparkles className="h-6 w-6" />
            </div>
            <span className="text-xl font-bold gradient-text">RupeeWise</span>
          </Link>

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Menu
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-2">
                {/* Account / Settings */}
                <button
                  onClick={() => handleMenuItemClick('/settings')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-muted transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                    <Settings className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Account</p>
                    <p className="text-xs text-muted-foreground">{profile?.username}</p>
                  </div>
                </button>

                {/* Transactions */}
                <button
                  onClick={() => handleMenuItemClick('/transactions')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-muted transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                    <Receipt className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Transactions</p>
                    <p className="text-xs text-muted-foreground">View all transactions</p>
                  </div>
                </button>

                {/* Sign Out */}
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignOut();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-destructive/10 transition-colors text-left text-destructive"
                >
                  <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <LogOut className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">Sign Out</p>
                    <p className="text-xs text-muted-foreground">Logout from account</p>
                  </div>
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Floating Sidebar */}
      <aside className="fixed left-6 top-6 bottom-6 w-20 z-50 hidden lg:block">
        <div className="h-full glass-effect rounded-3xl p-4 flex flex-col items-center gap-6 shadow-2xl">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg">
            <Sparkles className="h-6 w-6" />
          </Link>

          {/* Navigation */}
          <nav className="flex-1 flex flex-col gap-3 w-full">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    relative flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300
                    ${isActive 
                      ? 'bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg scale-110' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-105'
                    }
                  `}
                  title={item.label}
                >
                  <Icon className="h-5 w-5" />
                  {isActive && (
                    <span className="absolute -right-1 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-full" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Logout */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            className="w-12 h-12 rounded-2xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Sign Out"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-32 min-h-screen pb-20 lg:pb-0 pt-16 lg:pt-0">
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 lg:hidden glass-effect border-t border-border/50 z-50 safe-area-inset-bottom">
        <div className="flex items-center justify-around px-2 py-3">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex flex-col items-center gap-1 px-2 py-1 rounded-xl transition-all min-w-[60px]
                  ${isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground'
                  }
                `}
              >
                <div className={`
                  h-10 w-10 rounded-xl flex items-center justify-center transition-all
                  ${isActive 
                    ? 'bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg' 
                    : 'hover:bg-muted'
                  }
                `}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
