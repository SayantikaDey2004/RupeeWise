import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts';
import type { Transaction } from '@/types';
import { CATEGORY_LABELS } from '@/types';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, subDays } from 'date-fns';

const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#eab308', // lime
  '#f97316', // orange
  '#6366f1', // indigo
  '#84cc16', // lime-green
  '#0ea5e9', // sky
];


const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
        <p className="text-sm font-medium">{label || payload[0].payload.date}</p>
        <p className="text-sm font-semibold text-primary">
          ₹{parseFloat(payload[0].value).toFixed(2)}
        </p>
      </div>
    );
  }
  return null;
};

const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border rounded-lg p-2 shadow-lg">
        <p className="text-sm font-medium">{payload[0].name}</p>
        <p className="text-sm font-semibold text-primary">
          ₹{payload[0].value.toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground">
          {((payload[0].value / payload[0].payload.total) * 100).toFixed(1)}%
        </p>
      </div>
    );
  }
  return null;
};

const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.05) return null;

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="text-xs font-bold drop-shadow-lg"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

interface ExpenseAnalyticsProps {
  transactions: Transaction[];
}

export default function ExpenseAnalytics({ transactions }: ExpenseAnalyticsProps) {
  const [period, setPeriod] = useState<'daily' | 'monthly' | 'yearly'>('daily');

  // Calculate year-over-year comparison (this year vs last year)
  const yearComparison = useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    const daysByMonth: Record<string, { thisYear: number; lastYear: number }> = {};

    // Initialize data for all months of the current year up to today
    for (let month = 0; month <= currentMonth; month++) {
      const date = new Date(currentYear, month, 1);
      const monthStr = format(date, 'MMM');
      daysByMonth[monthStr] = { thisYear: 0, lastYear: 0 };
    }

    // Sum transactions for this year
    transactions.forEach((tx) => {
      const txDate = new Date(tx.transaction_date);
      if (txDate.getFullYear() === currentYear && txDate <= today) {
        const monthStr = format(txDate, 'MMM');
        if (daysByMonth[monthStr]) {
          daysByMonth[monthStr].thisYear += Number(tx.amount);
        }
      }
    });

    // Sum transactions for last year (same period)
    transactions.forEach((tx) => {
      const txDate = new Date(tx.transaction_date);
      const lastYear = currentYear - 1;
      if (txDate.getFullYear() === lastYear && txDate.getMonth() <= currentMonth) {
        const monthStr = format(new Date(currentYear, txDate.getMonth(), 1), 'MMM');
        if (daysByMonth[monthStr]) {
          daysByMonth[monthStr].lastYear += Number(tx.amount);
        }
      }
    });

    return Object.entries(daysByMonth).map(([month, data]) => ({
      date: month,
      displayDate: month,
      thisYear: parseFloat(data.thisYear.toFixed(2)),
      lastYear: parseFloat(data.lastYear.toFixed(2)),
    }));
  }, [transactions]);

  const dailyPulse = useMemo(() => {
    const today = new Date();
    const start = subDays(today, 13);
    const dayBuckets: Record<string, number> = {};

    for (let i = 13; i >= 0; i--) {
      const day = subDays(today, i);
      const key = format(day, 'MMM dd');
      dayBuckets[key] = 0;
    }

    transactions.forEach((tx) => {
      const txDate = new Date(tx.transaction_date);
      if (isWithinInterval(txDate, { start, end: today })) {
        const key = format(txDate, 'MMM dd');
        if (key in dayBuckets) {
          dayBuckets[key] += Number(tx.amount);
        }
      }
    });

    return Object.entries(dayBuckets).map(([date, amount]) => ({
      date,
      amount,
    }));
  }, [transactions]);

  // Calculate daily expenses
  const dailyExpenses = useMemo(() => {
    const today = new Date();
    const startOfCurrentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const last30Days: Record<string, number> = {};

    // Initialize last 30 days
    for (let i = 29; i >= 0; i--) {
      const date = new Date(startOfCurrentDay);
      date.setDate(date.getDate() - i);
      const dateStr = format(date, 'MMM dd');
      last30Days[dateStr] = 0;
    }

    // Sum transactions for each day
    transactions.forEach((tx) => {
      const txDate = new Date(tx.transaction_date);
      const daysAgo = Math.floor(
        (startOfCurrentDay.getTime() - new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate()).getTime()) /
          (1000 * 60 * 60 * 24)
      );

      if (daysAgo >= 0 && daysAgo <= 29) {
        const dateStr = format(txDate, 'MMM dd');
        last30Days[dateStr] += Number(tx.amount);
      }
    });

    return Object.entries(last30Days).map(([date, amount]) => ({
      date,
      displayDate: date,
      amount,
    }));
  }, [transactions]);

  // Calculate monthly expenses
  const monthlyExpenses = useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const monthlyData: Record<string, number> = {};

    // Initialize last 12 months
    for (let i = 11; i >= 0; i--) {
      const date = new Date(currentYear, currentMonth - i, 1);
      const monthStr = format(date, 'MMM yyyy');
      monthlyData[monthStr] = 0;
    }

    // Sum transactions for each month
    transactions.forEach((tx) => {
      const txDate = new Date(tx.transaction_date);
      const monthStr = format(txDate, 'MMM yyyy');
      if (monthlyData.hasOwnProperty(monthStr)) {
        monthlyData[monthStr] += Number(tx.amount);
      }
    });

    return Object.entries(monthlyData).map(([month, amount]) => ({
      date: month,
      displayDate: month,
      amount,
    }));
  }, [transactions]);

  // Calculate yearly expenses
  const yearlyExpenses = useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const yearlyData: Record<string, number> = {};

    // Initialize last 5 years
    for (let i = 4; i >= 0; i--) {
      const year = currentYear - i;
      yearlyData[year.toString()] = 0;
    }

    // Sum transactions for each year
    transactions.forEach((tx) => {
      const txDate = new Date(tx.transaction_date);
      const year = txDate.getFullYear().toString();
      if (yearlyData.hasOwnProperty(year)) {
        yearlyData[year] += Number(tx.amount);
      }
    });

    return Object.entries(yearlyData).map(([year, amount]) => ({
      date: year,
      displayDate: year,
      amount,
    }));
  }, [transactions]);

  // Calculate category breakdown for current day
  const dailyCategoryBreakdown = useMemo(() => {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const categorySpending: Record<string, number> = {};
    let totalAmount = 0;

    transactions.forEach((tx) => {
      const txDate = new Date(tx.transaction_date);
      if (isWithinInterval(txDate, { start: startOfDay, end: endOfDay })) {
        categorySpending[tx.category] = (categorySpending[tx.category] || 0) + Number(tx.amount);
        totalAmount += Number(tx.amount);
      }
    });

    return Object.entries(categorySpending)
      .map(([category, value], index) => ({
        name: CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category,
        value: parseFloat(value.toFixed(2)),
        fill: COLORS[index % COLORS.length],
        total: totalAmount,
      }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  // Calculate category breakdown for current month
  const monthlyCategoryBreakdown = useMemo(() => {
    const today = new Date();
    const start = startOfMonth(today);
    const end = endOfMonth(today);

    const categorySpending: Record<string, number> = {};
    let totalAmount = 0;

    transactions.forEach((tx) => {
      const txDate = new Date(tx.transaction_date);
      if (isWithinInterval(txDate, { start, end })) {
        categorySpending[tx.category] = (categorySpending[tx.category] || 0) + Number(tx.amount);
        totalAmount += Number(tx.amount);
      }
    });

    return Object.entries(categorySpending)
      .map(([category, value], index) => ({
        name: CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category,
        value: parseFloat(value.toFixed(2)),
        fill: COLORS[index % COLORS.length],
        total: totalAmount,
      }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  // Calculate category breakdown for current year
  const yearlyCategoryBreakdown = useMemo(() => {
    const today = new Date();
    const start = startOfYear(today);
    const end = endOfYear(today);

    const categorySpending: Record<string, number> = {};
    let totalAmount = 0;

    transactions.forEach((tx) => {
      const txDate = new Date(tx.transaction_date);
      if (isWithinInterval(txDate, { start, end })) {
        categorySpending[tx.category] = (categorySpending[tx.category] || 0) + Number(tx.amount);
        totalAmount += Number(tx.amount);
      }
    });

    return Object.entries(categorySpending)
      .map(([category, value], index) => ({
        name: CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category,
        value: parseFloat(value.toFixed(2)),
        fill: COLORS[index % COLORS.length],
        total: totalAmount,
      }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  const totalDaily = dailyCategoryBreakdown.reduce((sum, item) => sum + item.value, 0);
  const totalMonthly = monthlyCategoryBreakdown.reduce((sum, item) => sum + item.value, 0);
  const totalYearly = yearlyCategoryBreakdown.reduce((sum, item) => sum + item.value, 0);

  const monthlyCategoryCards = useMemo(() => {
    return monthlyCategoryBreakdown.map((item) => {
      const percent = totalMonthly > 0 ? (item.value / totalMonthly) * 100 : 0;
      return {
        ...item,
        percent: Number(percent.toFixed(1)),
      };
    });
  }, [monthlyCategoryBreakdown, totalMonthly]);

  const yearlyCategoryCards = useMemo(() => {
    return yearlyCategoryBreakdown.map((item) => {
      const percent = totalYearly > 0 ? (item.value / totalYearly) * 100 : 0;
      return {
        ...item,
        percent: Number(percent.toFixed(1)),
      };
    });
  }, [yearlyCategoryBreakdown, totalYearly]);

  const getChartData = () => {
    switch (period) {
      case 'monthly':
        return monthlyExpenses;
      case 'yearly':
        return yearlyExpenses;
      default:
        return dailyExpenses;
    }
  };

  const getCategoryData = () => {
    switch (period) {
      case 'monthly':
        return monthlyCategoryBreakdown;
      case 'yearly':
        return yearlyCategoryBreakdown;
      default:
        return dailyCategoryBreakdown;
    }
  };

  const getTotalExpenses = () => {
    switch (period) {
      case 'monthly':
        return totalMonthly;
      case 'yearly':
        return totalYearly;
      default:
        return totalDaily;
    }
  };

  const chartData = getChartData();
  const categoryData = getCategoryData();
  const hasData = chartData.some((item) => item.amount > 0) || categoryData.some((item) => item.value > 0);

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-lg floating-card overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Daily Pulse</CardTitle>
              <p className="text-sm text-muted-foreground">Last 14 days spending rhythm</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">14-Day Total</p>
              <p className="text-2xl font-bold">
                ₹{dailyPulse.reduce((sum, item) => sum + item.amount, 0).toFixed(2)}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative h-64">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_55%)]" />
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyPulse} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pulseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fill: 'currentColor', fontSize: 12 }} axisLine={false} />
                <YAxis tick={{ fill: 'currentColor', fontSize: 12 }} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  fill="url(#pulseGradient)"
                  dot={{ r: 2.5, strokeWidth: 1.5, fill: '#3b82f6' }}
                  activeDot={{ r: 5 }}
                  animationDuration={500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Tabs value={period} onValueChange={(value) => setPeriod(value as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-muted/50 rounded-lg p-1">
          <TabsTrigger value="daily" className="rounded-md">
            Daily
          </TabsTrigger>
          <TabsTrigger value="monthly" className="rounded-md">
            Monthly
          </TabsTrigger>
          <TabsTrigger value="yearly" className="rounded-md">
            Yearly
          </TabsTrigger>
        </TabsList>

        <div className="grid gap-6 mt-6 lg:grid-cols-3">
          {/* Trend Chart */}
          <Card className="lg:col-span-2 border-none shadow-lg floating-card overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle>
                {period === 'daily' ? 'Daily' : period === 'monthly' ? 'Monthly' : 'Yearly'} Spending Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-0">
              {hasData && chartData.some((item) => item.amount > 0) ? (
                <TabsContent value={period} className="m-0">
                  <div className="w-full h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      {period === 'daily' ? (
                        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis
                            dataKey="displayDate"
                            stroke="#888888"
                            style={{ fontSize: '12px' }}
                            tick={{ fill: 'currentColor' }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis stroke="#888888" style={{ fontSize: '12px' }} tick={{ fill: 'currentColor' }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="amount"
                            name="Spending (₹)"
                            stroke="#3b82f6"
                            strokeWidth={3}
                            dot={{ fill: '#3b82f6', r: 4 }}
                            activeDot={{ r: 6 }}
                            animationDuration={500}
                          />
                        </LineChart>
                      ) : (
                        <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis
                            dataKey="displayDate"
                            stroke="#888888"
                            style={{ fontSize: '12px' }}
                            tick={{ fill: 'currentColor' }}
                            angle={period === 'yearly' ? 0 : -45}
                            textAnchor={period === 'yearly' ? 'middle' : 'end'}
                            height={period === 'yearly' ? 60 : 80}
                          />
                          <YAxis stroke="#888888" style={{ fontSize: '12px' }} tick={{ fill: 'currentColor' }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                          <Bar
                            dataKey="amount"
                            name="Spending (₹)"
                            fill="#3b82f6"
                            radius={[8, 8, 0, 0]}
                            animationDuration={500}
                          />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </TabsContent>
              ) : (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                  <p>No expenses recorded for this period</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category Summary */}
          <Card className="border-none shadow-lg floating-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {period === 'daily' ? 'Today' : period === 'monthly' ? 'This Month' : 'This Year'}
              </CardTitle>
              <div className="text-2xl font-bold mt-2">₹{getTotalExpenses().toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Total spending</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {categoryData.length > 0 ? (
                  categoryData.map((item) => {
                    const totalForPercent = getTotalExpenses();
                    const percent = totalForPercent > 0 ? (item.value / totalForPercent) * 100 : 0;
                    return (
                      <div key={item.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 flex-1">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: item.fill }}
                          />
                          <span className="font-medium truncate">{item.name}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">₹{item.value.toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">
                            {percent.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">No expenses in this category</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Category Breakdown Pie Chart */}
        {categoryData.length > 0 && (
          <Card className="border-none shadow-lg floating-card mt-6">
            <CardHeader className="pb-3">
              <CardTitle>
                {period === 'daily' ? 'Daily' : period === 'monthly' ? 'Monthly' : 'Yearly'} Expense
                Breakdown by Category
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Distribution of spending across categories
              </p>
            </CardHeader>
            <CardContent>
              <div className="w-full h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderCustomizedLabel}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                      animationDuration={500}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="grid grid-cols-2 gap-4 mt-8">
                {categoryData.map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.fill }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">₹{item.value.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {monthlyCategoryCards.length > 0 && (
          <Card className="border-none shadow-lg floating-card mt-6">
            <CardHeader className="pb-3">
              <CardTitle>Monthly Category Spotlight</CardTitle>
              <p className="text-sm text-muted-foreground">
                Every category gets its own chart for this month
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {monthlyCategoryCards.map((item) => (
                  <div key={`monthly-${item.name}`} className="rounded-xl border border-border/50 bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold truncate">{item.name}</h4>
                      <span className="text-xs text-muted-foreground">{item.percent}%</span>
                    </div>
                    <div className="mt-3 flex items-center gap-4">
                      <div className="h-20 w-20">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Spent', value: item.value },
                                { name: 'Other', value: Math.max(totalMonthly - item.value, 0) },
                              ]}
                              innerRadius={26}
                              outerRadius={38}
                              paddingAngle={2}
                              dataKey="value"
                              stroke="none"
                            >
                              <Cell fill={item.fill} />
                              <Cell fill="#e5e7eb" />
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Monthly spend</p>
                        <p className="text-lg font-bold">₹{item.value.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {yearlyCategoryCards.length > 0 && (
          <Card className="border-none shadow-lg floating-card mt-6">
            <CardHeader className="pb-3">
              <CardTitle>Yearly Category Spotlight</CardTitle>
              <p className="text-sm text-muted-foreground">
                Full-year category impact with radial arcs
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {yearlyCategoryCards.map((item) => (
                  <div key={`yearly-${item.name}`} className="rounded-xl border border-border/50 bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold truncate">{item.name}</h4>
                      <span className="text-xs text-muted-foreground">{item.percent}%</span>
                    </div>
                    <div className="mt-3 flex items-center gap-4">
                      <div className="h-20 w-20">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadialBarChart
                            innerRadius="70%"
                            outerRadius="100%"
                            data={[{ name: item.name, value: item.percent }]}
                            startAngle={90}
                            endAngle={-270}
                          >
                            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                            <RadialBar dataKey="value" cornerRadius={8} fill={item.fill} />
                          </RadialBarChart>
                        </ResponsiveContainer>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Yearly spend</p>
                        <p className="text-lg font-bold">₹{item.value.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Year-over-Year Comparison Chart */}
        {yearComparison.length > 0 && yearComparison.some(item => item.thisYear > 0 || item.lastYear > 0) && (
          <Card className="border-none shadow-lg floating-card mt-6">
            <CardHeader className="pb-3">
              <CardTitle>Year-over-Year Comparison</CardTitle>
              <p className="text-sm text-muted-foreground">
                Compare current year spending with last year (same period)
              </p>
            </CardHeader>
            <CardContent>
              <div className="w-full h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={yearComparison} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="displayDate"
                      stroke="#888888"
                      style={{ fontSize: '12px' }}
                      tick={{ fill: 'currentColor' }}
                    />
                    <YAxis stroke="#888888" style={{ fontSize: '12px' }} tick={{ fill: 'currentColor' }} />
                    <Tooltip content={<CustomYearComparisonTooltip />} />
                    <Legend 
                      wrapperStyle={{ paddingTop: '20px' }}
                      verticalAlign="top"
                      height={36}
                    />
                    <Line
                      type="monotone"
                      dataKey="thisYear"
                      name="This Year (₹)"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      dot={{ fill: '#3b82f6', r: 4 }}
                      activeDot={{ r: 6 }}
                      animationDuration={500}
                    />
                    <Line
                      type="monotone"
                      dataKey="lastYear"
                      name="Last Year (₹)"
                      stroke="#ef4444"
                      strokeWidth={3}
                      strokeDasharray="5 5"
                      dot={{ fill: '#ef4444', r: 4 }}
                      activeDot={{ r: 6 }}
                      animationDuration={500}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* Year Comparison Stats */}
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-muted-foreground">This Year Total</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    ₹{yearComparison.reduce((sum, item) => sum + item.thisYear, 0).toFixed(2)}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-muted-foreground">Last Year Total</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                    ₹{yearComparison.reduce((sum, item) => sum + item.lastYear, 0).toFixed(2)}
                  </p>
                </div>
              </div>
              {/* Year-over-Year Change */}
              {(() => {
                const thisYearTotal = yearComparison.reduce((sum, item) => sum + item.thisYear, 0);
                const lastYearTotal = yearComparison.reduce((sum, item) => sum + item.lastYear, 0);
                const change = thisYearTotal - lastYearTotal;
                const changePercent = lastYearTotal > 0 ? (change / lastYearTotal) * 100 : 0;
                
                return (
                  <div className="mt-4 p-4 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground mb-2">Year-over-Year Change</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-2xl font-bold ${change > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {change > 0 ? '+' : ''}{change.toFixed(2)}
                      </span>
                      <span className={`text-lg font-semibold ${change > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        ({changePercent > 0 ? '+' : ''}{changePercent.toFixed(1)}%)
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {change > 0 ? 'More spending' : 'Less spending'}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}
      </Tabs>
    </div>
  );
}

const CustomYearComparisonTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
        <p className="text-sm font-medium">{payload[0].payload.displayDate}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm font-semibold" style={{ color: entry.color }}>
            {entry.name}: ₹{parseFloat(entry.value).toFixed(2)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};
