import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Building2,
  LayoutGrid,
  ClipboardList,
  FileText,
  Banknote,
  TrendingUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  dashboardService,
  DashboardData,
  RecentRequest,
  RecentCollection,
} from "@/services/dashboard";

// Palettes assigned by index, so any lookup status (renamed or newly added) gets a
// colour without hardcoding the Arabic names.
const PIE_PALETTE = ["#16A34A", "#D97706", "#1E40AF", "#9CA3AF", "#8B5CF6", "#DC2626"];
const BADGE_PALETTE = [
  "bg-blue-100 text-blue-700 hover:bg-blue-100",
  "bg-amber-100 text-amber-700 hover:bg-amber-100",
  "bg-green-100 text-green-700 hover:bg-green-100",
  "bg-gray-100 text-gray-700 hover:bg-gray-100",
  "bg-purple-100 text-purple-700 hover:bg-purple-100",
];

const formatKwd = (value: number) => `${value.toLocaleString("en-US")} د.ك`;

// Slice labels are drawn *inside* the wedge, at the midpoint of its arc. Recharts'
// default label sits outside the pie, so with several statuses the labels collide
// with each other and the ones near the bottom fall outside the chart box. Placing
// them inside makes collisions impossible; the status names are carried by the
// legend. Slivers below 6% are left unlabelled — the text would not fit — and stay
// readable through the tooltip.
type PieSliceLabel = {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  value: number;
};

const renderPieSliceLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  value,
}: PieSliceLabel) => {
  if (percent < 0.06) return null;

  const radian = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * radian);
  const y = cy + radius * Math.sin(-midAngle * radian);

  return (
    <text
      x={x}
      y={y}
      fill="#FFFFFF"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
    >
      {value}
    </text>
  );
};

const DashboardPage = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    dashboardService
      .get()
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => toast.error("تعذّر تحميل بيانات لوحة التحكم"))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // ── Derive view-model from the backend payload ─────────────────────────────
  const toStats = (slices: { name: string; value: number }[]) =>
    slices.map((s) => ({ label: s.name, value: s.value }));

  const summaryCards = useMemo(() => {
    if (!data) return [];
    const { cards } = data;
    return [
      {
        title: "إجمالي العقارات",
        number: String(cards.properties.total),
        subtitle: "عقار مسجل في النظام",
        icon: Building2,
        iconColor: "#1E40AF",
        stats: toStats(data.properties_status),
      },
      {
        title: "الوحدات النشطة",
        number: String(cards.units.total),
        subtitle: "وحدة موزعة على العقارات",
        icon: LayoutGrid,
        iconColor: "#4F46E5",
        stats: toStats(data.units_status),
      },
      {
        title: "الطلبات المفتوحة",
        number: String(cards.requests.open),
        subtitle: "طلب قيد المتابعة",
        icon: ClipboardList,
        iconColor: "#D97706",
        stats: toStats(data.requests_status),
      },
      {
        title: "العقود النشطة",
        number: String(cards.contracts.active),
        subtitle: "عقد إيجار وبيع نشط",
        icon: FileText,
        iconColor: "#16A34A",
        stats: [
          { label: "إيجار", value: cards.contracts.rental },
          { label: "بيع", value: cards.contracts.sale },
        ],
      },
      {
        title: "تحصيل اليوم",
        number: formatKwd(cards.today_collections),
        subtitle: "إجمالي المحصّل اليوم",
        icon: Banknote,
        iconColor: "#16A34A",
        stats: [] as { label: string; value: number }[],
      },
      {
        title: "تحصيل الشهر",
        number: formatKwd(cards.month_collections),
        subtitle: "إجمالي محصّلات الشهر الحالي",
        icon: TrendingUp,
        iconColor: "#1E40AF",
        stats: [] as { label: string; value: number }[],
      },
    ];
  }, [data]);

  const barData = data?.monthly_collections ?? [];
  const pieData = useMemo(
    () =>
      (data?.properties_status ?? []).map((s, i) => ({
        ...s,
        color: PIE_PALETTE[i % PIE_PALETTE.length],
      })),
    [data],
  );
  const recentRequests: RecentRequest[] = data?.recent_requests ?? [];
  const recentCollections: RecentCollection[] = data?.recent_collections ?? [];

  // Colour each request status by its position in the lookup list (no hardcoded names).
  const requestStatusClass = useMemo(() => {
    const map: Record<string, string> = {};
    (data?.requests_status ?? []).forEach((s, i) => {
      map[s.name] = BADGE_PALETTE[i % BADGE_PALETTE.length];
    });
    return map;
  }, [data]);

  const statusBadge = (status: string) => (
    <Badge variant="secondary" className={requestStatusClass[status] ?? ""}>{status}</Badge>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        جارٍ تحميل البيانات...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.title} className="bg-card">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{card.title}</p>
                  <p className="text-3xl font-bold text-foreground">{card.number}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                </div>
                <div
                  className="w-11 h-11 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: card.iconColor + "15" }}
                >
                  <card.icon size={22} style={{ color: card.iconColor }} />
                </div>
              </div>
              {card.stats.length > 0 && (
                <div className="flex gap-3 pt-3 border-t text-xs text-muted-foreground flex-wrap">
                  {card.stats.map((s) => (
                    <span key={s.label}>
                      {s.label} <strong className="text-foreground">{s.value}</strong>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">التحصيلات الشهرية</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => [`${value} د.ك`, "المبلغ"]} />
                <Bar dataKey="amount" fill="#1E40AF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">حالات العقارات</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  outerRadius={90}
                  dataKey="value"
                  label={renderPieSliceLabel}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Legend
                  formatter={(value: string) => <span className="text-sm">{value}</span>}
                />
                <Tooltip formatter={(value: number, name: string) => [`${value}`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Requests */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">آخر الطلبات</CardTitle>
              <a className="text-sm text-primary hover:underline" href="/requests">عرض الكل</a>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">العميل</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">نوع الطلب</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">التصنيف</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">الحالة</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                        لا توجد طلبات
                      </td>
                    </tr>
                  ) : (
                    recentRequests.map((r, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-medium">{r.client}</td>
                        <td className="px-4 py-2.5">{r.type}</td>
                        <td className="px-4 py-2.5">{r.category}</td>
                        <td className="px-4 py-2.5">{statusBadge(r.status)}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.date}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recent Collections */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">آخر التحصيلات</CardTitle>
              <a className="text-sm text-primary hover:underline" href="/collections">عرض الكل</a>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">العميل</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">المبلغ</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">نوع التحصيل</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">طريقة الدفع</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCollections.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                        لا توجد تحصيلات
                      </td>
                    </tr>
                  ) : (
                    recentCollections.map((c, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-medium">{c.client}</td>
                        <td className="px-4 py-2.5 font-bold text-foreground">{formatKwd(c.amount)}</td>
                        <td className="px-4 py-2.5">{c.type}</td>
                        <td className="px-4 py-2.5">{c.method}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{c.date}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
