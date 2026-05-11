import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Shield, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Settings() {
  const {profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-sm md:text-base text-muted-foreground">Manage your account settings</p>
      </div>

      <Card className="floating-card border-none shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <User className="h-5 w-5" />
            Profile Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Username</p>
            <p className="text-base md:text-lg font-medium">{profile?.username}</p>
          </div>

         {/* <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="text-base md:text-lg font-medium">{profile?.email || user?.email}</p>
          </div> */}

          <div>
            <p className="text-sm text-muted-foreground">User Mode</p>
            <Badge variant="outline" className="mt-1">
              {profile?.user_mode === 'personal' ? 'Personal' : 'Family'}
            </Badge>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Role</p>
            <Badge variant={profile?.role === 'admin' ? 'default' : 'secondary'} className="mt-1">
              {profile?.role === 'admin' ? 'Admin' : 'User'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="floating-card border-none shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription className="text-sm">Manage your account security</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleSignOut} className="rounded-full">
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </CardContent>
      </Card>

      <Card className="floating-card border-none shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Disclaimer</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This assistant provides budgeting insights only and does not offer investment or legal advice.
            All financial calculations and suggestions are for informational purposes only.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
