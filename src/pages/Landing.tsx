import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Upload,
  Users,
  IndianRupee,
  TrendingUp,
  Bell,
  Shield,
  CheckCircle,
  ArrowRight,
  Sparkles,
  FileText,
  Target,
  AlertCircle,
  Lock,
  Eye,
  UserCheck
} from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();

  const features = [
    {
      icon: <MessageSquare className="h-8 w-8" />,
      title: 'AI Finance Assistant (Chat-Based)',
      description: 'Ask questions like "How much did I spend on groceries?" or "Am I overspending this month?" AI answers using your actual data with finance-only responses.',
      highlights: ['Natural language queries', 'Real data insights', 'Finance-only responses']
    },
    {
      icon: <Upload className="h-8 w-8" />,
      title: 'Receipt & Statement Upload',
      description: 'Upload receipts, bills, and bank statements. Automatic extraction of amount, date, and category. Everything stays private and secure.',
      highlights: ['Auto data extraction', 'Multiple formats', 'Secure storage']
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: 'Personal & Family Budgeting',
      description: 'Choose Personal mode (single income) or Family mode (combined household income). Add multiple earners and track shared expenses easily.',
      highlights: ['Personal mode', 'Family mode', 'Multi-earner support']
    },
    {
      icon: <IndianRupee className="h-8 w-8" />,
      title: 'Salary-Based Budget Planning',
      description: 'Enter your monthly or yearly salary. Manually set budgets OR let AI suggest a realistic plan. You always approve before saving.',
      highlights: ['Manual budgeting', 'AI suggestions', 'User approval required']
    },
    {
      icon: <TrendingUp className="h-8 w-8" />,
      title: 'Indian Market-Aware Budgeting',
      description: 'Budget suggestions based on Indian cost-of-living ranges, city-based expense patterns, and your past spending habits.',
      highlights: ['India-focused', 'Realistic averages', 'Context-aware']
    },
    {
      icon: <Bell className="h-8 w-8" />,
      title: 'Smart Alerts & Insights',
      description: 'Get notified when you reach 80% of a budget or spending spikes unusually. Clear, friendly alerts — no pressure.',
      highlights: ['Budget alerts', 'Spending insights', 'Friendly notifications']
    }
  ];

  const steps = [
    {
      number: '1',
      title: 'Sign up & choose mode',
      description: 'Create your account and select Personal or Family mode based on your needs'
    },
    {
      number: '2',
      title: 'Upload receipts or add income',
      description: 'Add your income sources and upload receipts to start tracking'
    },
    {
      number: '3',
      title: 'Set your budget',
      description: 'Create monthly or yearly budgets manually or with AI assistance'
    },
    {
      number: '4',
      title: 'Ask the AI & track progress',
      description: 'Chat with the AI assistant to understand your spending patterns'
    },
    {
      number: '5',
      title: 'Improve spending with insights',
      description: 'Use smart alerts and insights to make better financial decisions'
    }
  ];

  const painPoints = [
    'No clear idea where money goes',
    'Manual tracking is tiring',
    'Hard to plan monthly expenses',
    'Family finances get confusing',
    "Apps don't explain why you overspend"
  ];

  const trustPoints = [
    {
      icon: <Shield className="h-6 w-6" />,
      title: 'Finance-only AI',
      description: 'No unrelated questions answered'
    },
    {
      icon: <Lock className="h-6 w-6" />,
      title: 'Your data is private',
      description: 'Isolated and secure storage'
    },
    {
      icon: <Eye className="h-6 w-6" />,
      title: 'No investment advice',
      description: 'Budgeting insights only'
    },
    {
      icon: <UserCheck className="h-6 w-6" />,
      title: 'You stay in control',
      description: 'AI explains — you decide'
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass-effect border-b border-border/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground shadow-lg">
              <IndianRupee className="h-6 w-6" />
            </div>
            <span className="text-2xl font-bold gradient-text">RupeeWise</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/login')} className="rounded-full">
              Sign In
            </Button>
            <Button onClick={() => navigate('/login')} className="rounded-full bg-gradient-to-r from-primary to-secondary hover:opacity-90">
              Sign Up
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-bg-1" />
        <div className="container mx-auto px-4 py-20 md:py-32 relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <Badge variant="outline" className="text-base px-6 py-2 rounded-full border-2 border-primary/20 bg-background/50 backdrop-blur">
              Built for India 🇮🇳
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              <span className="gradient-text">Your personal AI</span>
              <br />
              <span className="text-foreground">budget planner</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
              Track expenses, set budgets, and plan your monthly or family finances using AI powered by your real spending data — not guesses.
            </p>
          
            {/* Key Highlights */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto pt-8">
              <div className="flex flex-col items-center gap-2 p-4">
                <Sparkles className="h-8 w-8 text-primary" />
                <span className="text-sm font-medium text-center">AI-assisted budgeting</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-4">
                <Users className="h-8 w-8 text-primary" />
                <span className="text-sm font-medium text-center">Personal & family planning</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-4">
                <Upload className="h-8 w-8 text-primary" />
                <span className="text-sm font-medium text-center">Receipt uploads & insights</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-4">
                <Shield className="h-8 w-8 text-primary" />
                <span className="text-sm font-medium text-center">Privacy-focused AI</span>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
              <Button size="lg" className="text-lg px-8 py-6" onClick={() => navigate('/login')}>
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-6" onClick={() => {
                document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
              }}>
                See How It Works
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Statement Section */}
      <section className="bg-muted/50 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h2 className="text-3xl md:text-4xl font-bold">Why Managing Money Is Hard</h2>
            <p className="text-lg text-muted-foreground">
              We understand the challenges Indian families and professionals face with personal finance
            </p>
            <div className="grid md:grid-cols-2 gap-6 pt-8">
              {painPoints.map((point, index) => (
                <Card key={index} className="text-left">
                  <CardContent className="flex items-start gap-4 p-6">
                    <AlertCircle className="h-6 w-6 text-destructive shrink-0 mt-1" />
                    <p className="text-lg">{point}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h2 className="text-3xl md:text-4xl font-bold">One AI Assistant. Complete Financial Clarity.</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              RupeeWise solves these problems using real transaction data, uploaded receipts, budget goals, and AI explanations. The AI helps you understand and plan — you stay in control.
            </p>
            <div className="grid md:grid-cols-4 gap-6 pt-8">
              <Card>
                <CardContent className="flex flex-col items-center gap-3 p-6">
                  <FileText className="h-10 w-10 text-primary" />
                  <p className="font-medium text-center">Real transaction data</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex flex-col items-center gap-3 p-6">
                  <Upload className="h-10 w-10 text-primary" />
                  <p className="font-medium text-center">Uploaded receipts</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex flex-col items-center gap-3 p-6">
                  <Target className="h-10 w-10 text-primary" />
                  <p className="font-medium text-center">Budget goals</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex flex-col items-center gap-3 p-6">
                  <Sparkles className="h-10 w-10 text-primary" />
                  <p className="font-medium text-center">AI explanations</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features Section */}
      <section className="bg-muted/50 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto space-y-12">
            <div className="text-center space-y-4">
              <h2 className="text-3xl md:text-4xl font-bold">Key Features</h2>
              <p className="text-lg text-muted-foreground">Everything you need to take control of your finances</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                      {feature.icon}
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                    <CardDescription className="text-base">{feature.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {feature.highlights.map((highlight, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span className="text-sm">{highlight}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto space-y-12">
            <div className="text-center space-y-4">
              <h2 className="text-3xl md:text-4xl font-bold">How It Works</h2>
              <p className="text-lg text-muted-foreground">Get started in 5 simple steps</p>
            </div>
            <div className="space-y-6">
              {steps.map((step, index) => (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardContent className="flex items-start gap-6 p-6">
                    <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold shrink-0">
                      {step.number}
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold">{step.title}</h3>
                      <p className="text-muted-foreground">{step.description}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust & Privacy Section */}
      <section className="bg-muted/50 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto space-y-12">
            <div className="text-center space-y-4">
              <h2 className="text-3xl md:text-4xl font-bold">Your Data. Your Control.</h2>
              <p className="text-lg text-muted-foreground">We prioritize your privacy and security</p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {trustPoints.map((point, index) => (
                <Card key={index}>
                  <CardContent className="flex items-start gap-4 p-6">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      {point.icon}
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-bold text-lg">{point.title}</h3>
                      <p className="text-muted-foreground">{point.description}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="bg-background border-2 border-primary/20 rounded-lg p-6 text-center">
              <p className="text-sm text-muted-foreground">
                <strong>Disclaimer:</strong> This platform provides budgeting insights only and does not offer investment or legal advice.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-8 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-2xl p-12">
            <h2 className="text-3xl md:text-4xl font-bold">Take Control of Your Money — Starting Today</h2>
            <p className="text-lg text-muted-foreground">
              Join thousands of Indians making smarter financial decisions with AI
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="text-lg px-8 py-6" onClick={() => navigate('/login')}>
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-6" onClick={() => navigate('/login')}>
                Try the AI Assistant
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-muted/50 border-t py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            {/* Product */}
            <div className="space-y-4">
              <h3 className="font-bold text-lg">Product</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">How It Works</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a></li>
              </ul>
            </div>

            {/* Company */}
            <div className="space-y-4">
              <h3 className="font-bold text-lg">Company</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">About</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Contact</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Careers</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div className="space-y-4">
              <h3 className="font-bold text-lg">Legal</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Terms of Service</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Disclaimer</a></li>
              </ul>
            </div>

            {/* Social */}
            <div className="space-y-4">
              <h3 className="font-bold text-lg">Connect</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">GitHub</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">LinkedIn</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Email Support</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t pt-8 text-center text-muted-foreground">
            <p>© 2026 RupeeWise. Built for smarter financial decisions in India.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
