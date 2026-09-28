import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MultiSearchableSelect } from '@/components/ui/searchable-select';
import ResetFiltersButton from '@/components/ResetFiltersButton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building2, LayoutGrid, Users, FileText, Banknote, ClipboardList, Download } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { exportReportPDF } from '@/lib/reportPdf';
import { useLookups } from '@/contexts/LookupsContext';
import { formatDateTime } from '@/lib/utils';
import { CLIENT_TYPES } from '@/lib/clientTypes';
import {
  reportsService,
  ReportSummary,
  CollectionsReportData,
  PropertiesReportData,
  ContractsReportData,
  ClientsReportData,
  ContractRow,
} from '@/services/reports';

const COLORS = ['#1E40AF', '#16A34A', '#D97706', '#DC2626', '#8B5CF6', '#6B7280'];

const statusColors: Record<string, string> = {
  'متاح': '#16A34A', 'محجوز': '#D97706', 'مؤجر': '#1E40AF', 'مباع': '#6B7280',
};

const collectionTypeColors: Record<string, string> = {
  'عمولة': 'bg-purple-100 text-purple-800',
  'إيجار (دفعة دورية)': 'bg-blue-100 text-blue-800',
  'عربون': 'bg-amber-100 text-amber-800',
  'دفعة نقدية': 'bg-green-100 text-green-800',
  'أخرى': 'bg-gray-100 text-gray-800',
};

const beneficiaryColors: Record<string, string> = {
  'المكتب': 'bg-blue-100 text-blue-800',
  'المالك': 'bg-green-100 text-green-800',
  'الوسيط': 'bg-orange-100 text-orange-800',
};

const contractStatusColors: Record<string, string> = {
  'نشط': 'bg-green-100 text-green-800',
  'مسودة': 'bg-amber-100 text-amber-800',
  'منتهي': 'bg-gray-100 text-gray-800',
  'مكتمل': 'bg-gray-100 text-gray-800',
  'ملغي': 'bg-red-100 text-red-800',
};

// Hex fills for the contract-status stacked bar chart (recharts needs hex, not classes).
const contractStatusChartColors: Record<string, string> = {
  'نشط': '#16A34A',
  'مسودة': '#D97706',
  'منتهي': '#6B7280',
  'مكتمل': '#1E40AF',
  'ملغي': '#DC2626',
};

// ======== TAB 1: General Summary ========
const GeneralSummaryTab = () => {
  const { requestStatuses, contractStatuses } = useLookups();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    reportsService.summary()
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, []);

  // NOTE: Monthly collections and request/contract breakdown charts require
  // dedicated backend endpoints not yet available — showing placeholder data.
  const monthlyData = [
    { month: 'أكتوبر', office: 0, owner: 0 },
    { month: 'نوفمبر', office: 0, owner: 0 },
    { month: 'ديسمبر', office: 0, owner: 0 },
    { month: 'يناير', office: 0, owner: 0 },
    { month: 'فبراير', office: 0, owner: 0 },
    { month: 'مارس', office: 0, owner: 0 },
  ];

  const propertyStatusData = summary
    ? summary.properties_by_status.map(s => ({ name: s.status, value: s.count }))
    : [];

  const requestStatusData = requestStatuses.map(name => ({ name, value: 0 }));

  // One row per contract kind; a 0-initialized key for every status from the lookup.
  const zeroedStatuses = Object.fromEntries(contractStatuses.map(s => [s, 0]));
  const contractData = [
    { name: 'إيجار', ...zeroedStatuses },
    { name: 'بيع', ...zeroedStatuses },
  ];

  const kpis = [
    { label: 'إجمالي العقارات',   value: loading ? '…' : (summary?.total_properties   ?? '—'), icon: Building2,    color: 'text-primary' },
    { label: 'إجمالي الوحدات',    value: loading ? '…' : (summary?.total_units         ?? '—'), icon: LayoutGrid,   color: 'text-indigo-600' },
    { label: 'إجمالي العملاء',    value: loading ? '…' : (summary?.total_clients        ?? '—'), icon: Users,        color: 'text-green-600' },
    { label: 'العقود النشطة',      value: loading ? '…' : (summary?.active_contracts    ?? '—'), icon: FileText,     color: 'text-primary' },
    { label: 'إجمالي التحصيلات', value: loading ? '…' : (summary ? `${Number(summary.total_collections).toLocaleString()} د.ك` : '—'), icon: Banknote, color: 'text-green-600', highlight: true },
    { label: 'الطلبات المفتوحة',  value: loading ? '…' : (summary?.open_requests       ?? '—'), icon: ClipboardList, color: 'text-amber-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`p-3 rounded-lg bg-muted`}>
                <kpi.icon className={`h-6 w-6 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <p className={`text-xl font-bold ${kpi.highlight ? 'text-green-600' : 'text-foreground'}`}>{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">التحصيلات الشهرية</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="office" name="تحصيلات المكتب" fill="#1E40AF" />
                <Bar dataKey="owner" name="تحصيلات المالك" fill="#16A34A" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">توزيع حالات العقارات</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={propertyStatusData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {propertyStatusData.map((entry) => (
                    <Cell key={entry.name} fill={statusColors[entry.name] || '#6B7280'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">توزيع الطلبات حسب الحالة</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={requestStatusData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={80} />
                <Tooltip />
                <Bar dataKey="value" name="العدد" fill="#1E40AF" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">العقود حسب النوع والحالة</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={contractData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                {contractStatuses.map((status, i) => (
                  <Bar key={status} dataKey={status} stackId="a" fill={contractStatusChartColors[status] ?? COLORS[i % COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ======== TAB 2: Collections Report ========
const CollectionsReportTab = () => {
  const { collectionTypes, paymentBeneficiaries, paymentMethodsFor } = useLookups();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [beneficiaryFilter, setBeneficiaryFilter] = useState<string[]>([]);
  const [methodFilter, setMethodFilter] = useState<string[]>([]);
  const [reportData, setReportData] = useState<CollectionsReportData | null>(null);
  const hasActiveFilters =
    dateFrom !== '' || dateTo !== '' ||
    [typeFilter, beneficiaryFilter, methodFilter].some(f => f.length > 0);
  const resetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setTypeFilter([]);
    setBeneficiaryFilter([]);
    setMethodFilter([]);
  };
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    reportsService.collections({
      date_from:       dateFrom || undefined,
      date_to:         dateTo   || undefined,
      collection_type: typeFilter,
      beneficiary:     beneficiaryFilter,
      payment_method:  methodFilter,
    })
      .then(setReportData)
      .catch(() => setReportData(null))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, typeFilter, beneficiaryFilter, methodFilter]);

  const collections = reportData?.collections ?? [];
  const totalAmount = reportData?.total_amount ?? 0;
  const avgAmount   = reportData?.average      ?? 0;

  const pieData = useMemo(() => {
    if (!reportData?.by_type) return [];
    return Object.entries(reportData.by_type).map(([name, value]) => ({ name, value }));
  }, [reportData]);

  const handleExport = () => {
    const filters: string[] = [];
    if (typeFilter.length)        filters.push(`النوع: ${typeFilter.join('، ')}`);
    if (beneficiaryFilter.length) filters.push(`المستفيد: ${beneficiaryFilter.join('، ')}`);
    if (methodFilter.length)      filters.push(`طريقة الدفع: ${methodFilter.join('، ')}`);
    if (dateFrom) filters.push(`من: ${dateFrom}`);
    if (dateTo)   filters.push(`إلى: ${dateTo}`);

    exportReportPDF(
      'تقرير التحصيلات المالية',
      filters,
      [
        { header: 'رقم التحصيل', key: 'num' },
        { header: 'العميل',       key: 'client' },
        { header: 'النوع',        key: 'type' },
        { header: 'المبلغ',       key: 'amount' },
        { header: 'التاريخ',      key: 'date' },
        { header: 'تم الدفع',     key: 'status' },
      ],
      collections.map(c => ({
        num:    c.collection_number,
        client: c.client_name,
        type:   c.collection_type,
        amount: `${c.amount} د.ك`,
        date:   c.payment_date || '—',
        status: c.payment_date ? 'مدفوع' : 'بانتظار الدفع',
      })),
      [
        { label: 'إجمالي المبالغ',  value: `${totalAmount.toLocaleString()} د.ك` },
        { label: 'عدد العمليات',    value: collections.length.toString() },
        { label: 'متوسط الدفعة',   value: `${Math.round(avgAmount).toLocaleString()} د.ك` },
      ]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">من</label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">إلى</label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
        </div>
        <MultiSearchableSelect
          className="w-44"
          placeholder="نوع التحصيل"
          value={typeFilter}
          onValueChange={setTypeFilter}
          options={collectionTypes}
        />
        <MultiSearchableSelect
          className="w-36"
          placeholder="المستفيد"
          value={beneficiaryFilter}
          onValueChange={setBeneficiaryFilter}
          options={paymentBeneficiaries}
        />
        <MultiSearchableSelect
          className="w-40"
          placeholder="طريقة الدفع"
          value={methodFilter}
          onValueChange={setMethodFilter}
          options={paymentMethodsFor('collection')}
        />
        <ResetFiltersButton show={hasActiveFilters} onReset={resetFilters} spacer={false} />
        <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4 ml-1" />تصدير PDF</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">إجمالي المبالغ</p><p className="text-2xl font-bold text-green-600">{loading ? '…' : `${totalAmount.toLocaleString()} د.ك`}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">عدد العمليات</p><p className="text-2xl font-bold">{loading ? '…' : (reportData?.count ?? 0)}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">متوسط الدفعة</p><p className="text-2xl font-bold">{loading ? '…' : `${Math.round(avgAmount).toLocaleString()} د.ك`}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم التحصيل</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>العقار</TableHead>
                <TableHead>نوع التحصيل</TableHead>
                <TableHead>المستفيد</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>طريقة الدفع</TableHead>
                <TableHead>تاريخ الدفع</TableHead>
                <TableHead>تم الدفع</TableHead>
                <TableHead>فاتورة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">جاري التحميل...</TableCell></TableRow>
              ) : collections.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">لا توجد بيانات</TableCell></TableRow>
              ) : collections.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.collection_number}</TableCell>
                  <TableCell>{c.client_name}</TableCell>
                  <TableCell>{c.property_name || '—'}</TableCell>
                  <TableCell><Badge className={collectionTypeColors[c.collection_type] ?? 'bg-gray-100 text-gray-800'}>{c.collection_type}</Badge></TableCell>
                  <TableCell><Badge className={beneficiaryColors[c.beneficiary] ?? 'bg-gray-100 text-gray-800'}>{c.beneficiary}</Badge></TableCell>
                  <TableCell className="font-bold">{c.amount} د.ك</TableCell>
                  <TableCell>{c.payment_method}</TableCell>
                  <TableCell>{formatDateTime(c.payment_date)}</TableCell>
                  {/* A missing payment_date means an outstanding payment link — the
                      same rule the backend uses to keep it out of the totals. */}
                  <TableCell>
                    {c.payment_date
                      ? <Badge className="bg-green-100 text-green-800">مدفوع</Badge>
                      : <Badge className="bg-amber-100 text-amber-800">بانتظار الدفع</Badge>}
                  </TableCell>
                  <TableCell>{c.has_invoice ? <Badge className="bg-green-100 text-green-800">✅ صادرة</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">التحصيلات حسب النوع</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

// ======== TAB 3: Properties Report ========
const PropertiesReportTab = () => {
  const { propertyStatuses, propertyCats } = useLookups();
  const [listingFilter, setListingFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter]   = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [reportData, setReportData] = useState<PropertiesReportData | null>(null);
  const hasActiveFilters = [listingFilter, statusFilter, categoryFilter].some(f => f.length > 0);
  const resetFilters = () => {
    setListingFilter([]);
    setStatusFilter([]);
    setCategoryFilter([]);
  };
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    reportsService.properties({
      listing_type: listingFilter,
      status:       statusFilter,
      category:     categoryFilter,
    })
      .then(setReportData)
      .catch(() => setReportData(null))
      .finally(() => setLoading(false));
  }, [listingFilter, statusFilter, categoryFilter]);

  const properties = reportData?.properties ?? [];
  const available  = properties.filter(p => p.status === 'متاح').length;
  const occupied   = properties.filter(p => p.status === 'مؤجر' || p.status === 'مباع').length;

  // Category bar chart: computed from the filtered properties array
  const categoryData = useMemo(() => {
    const g: Record<string, number> = {};
    properties.forEach(p => { if (p.category) g[p.category] = (g[p.category] || 0) + 1; });
    return Object.entries(g).map(([name, value]) => ({ name, value }));
  }, [properties]);

  // Listing-type pie chart: uses global by_type from the backend
  const listingPieData = useMemo(() => {
    if (!reportData?.by_type) return [{ name: 'للإيجار', value: 0 }, { name: 'للبيع', value: 0 }];
    const rental = reportData.by_type.find(t => t.listing_type === 0)?.count ?? 0;
    const sale   = reportData.by_type.find(t => t.listing_type === 1)?.count ?? 0;
    return [
      { name: 'للإيجار', value: rental },
      { name: 'للبيع',   value: sale   },
    ];
  }, [reportData]);

  const handleExport = () => {
    const filters: string[] = [];
    if (listingFilter.length)  filters.push(`نوع العرض: ${listingFilter.join('، ')}`);
    if (statusFilter.length)   filters.push(`الحالة: ${statusFilter.join('، ')}`);
    if (categoryFilter.length) filters.push(`التصنيف: ${categoryFilter.join('، ')}`);
    exportReportPDF('تقرير العقارات', filters,
      [{ header: '#', key: 'idx' }, { header: 'العقار', key: 'name' }, { header: 'التصنيف', key: 'cat' }, { header: 'العرض', key: 'listing' }, { header: 'المالك', key: 'owner' }, { header: 'الحالة', key: 'status' }],
      properties.map((p, i) => ({ idx: String(i + 1), name: p.name, cat: p.category ?? '', listing: p.listing_type, owner: p.owner_name, status: p.status ?? '' })),
      [{ label: 'إجمالي العقارات', value: properties.length.toString() }, { label: 'المتاحة', value: available.toString() }, { label: 'المشغولة', value: occupied.toString() }]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-end">
        <MultiSearchableSelect
          className="w-36"
          placeholder="نوع العرض"
          value={listingFilter}
          onValueChange={setListingFilter}
          options={['إيجار', 'بيع']}
        />
        <MultiSearchableSelect
          className="w-36"
          placeholder="الحالة"
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={propertyStatuses}
        />
        <MultiSearchableSelect
          className="w-36"
          placeholder="التصنيف"
          value={categoryFilter}
          onValueChange={setCategoryFilter}
          options={propertyCats}
        />
        <ResetFiltersButton show={hasActiveFilters} onReset={resetFilters} spacer={false} />
        <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4 ml-1" />تصدير PDF</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">إجمالي العقارات</p><p className="text-2xl font-bold">{loading ? '…' : properties.length}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">العقارات المتاحة</p><p className="text-2xl font-bold text-green-600">{available}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">العقارات المشغولة</p><p className="text-2xl font-bold text-primary">{occupied}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>اسم العقار</TableHead>
                <TableHead>التصنيف</TableHead>
                <TableHead>نوع العرض</TableHead>
                <TableHead>المالك</TableHead>
                <TableHead>العنوان</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>تاريخ الإضافة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">جاري التحميل...</TableCell></TableRow>
              ) : properties.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">لا توجد بيانات</TableCell></TableRow>
              ) : properties.map((p, i) => (
                <TableRow key={p.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.category}</TableCell>
                  <TableCell><Badge variant="outline">{p.listing_type}</Badge></TableCell>
                  <TableCell>{p.owner_name}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{p.address}</TableCell>
                  <TableCell>
                    {p.status
                      ? <Badge style={{ backgroundColor: (statusColors[p.status] ?? '#6B7280') + '20', color: statusColors[p.status] ?? '#6B7280' }}>{p.status}</Badge>
                      : '—'}
                  </TableCell>
                  <TableCell>{p.created_at}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">العقارات حسب التصنيف</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" name="العدد" fill="#1E40AF" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">نسبة الإيجار مقابل البيع</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={listingPieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  <Cell fill="#1E40AF" />
                  <Cell fill="#16A34A" />
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ======== TAB 4: Contracts Report ========
const ContractsReportTab = () => {
  const { contractStatuses } = useLookups();
  const [typeFilter, setTypeFilter]     = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [reportData, setReportData] = useState<ContractsReportData | null>(null);
  const hasActiveFilters =
    dateFrom !== '' || dateTo !== '' || [typeFilter, statusFilter].some(f => f.length > 0);
  const resetFilters = () => {
    setTypeFilter([]);
    setStatusFilter([]);
    setDateFrom('');
    setDateTo('');
  };
  const [loading, setLoading] = useState(true);

  // Only status filter is supported by the backend; type + dates are applied client-side.
  useEffect(() => {
    setLoading(true);
    reportsService.contracts({
      status: statusFilter,
    })
      .then(setReportData)
      .catch(() => setReportData(null))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const allContracts = useMemo<ContractRow[]>(() => {
    if (!reportData) return [];
    const rental: ContractRow[] = reportData.rental_contracts.map(c => ({
      id:        String(c.id),
      number:    c.contract_number,
      type:      'إيجار',
      property:  c.property?.name ?? '',
      party:     c.tenant?.full_name ?? '',
      amount:    c.total_amount,
      startDate: (c.start_date ?? '').slice(0, 10),
      endDate:   (c.end_date   ?? '').slice(0, 10),
      status:    c.status,
    }));
    const sale: ContractRow[] = reportData.sale_contracts.map(c => ({
      id:        String(c.id),
      number:    c.contract_number,
      type:      'بيع',
      property:  c.property?.name ?? '',
      party:     c.buyer?.full_name ?? '',
      amount:    c.total_amount,
      startDate: (c.contract_date   ?? '').slice(0, 10),
      endDate:   c.delivery_date ? c.delivery_date.slice(0, 10) : '—',
      status:    c.status,
    }));
    return [...rental, ...sale];
  }, [reportData]);

  // Apply type + date filters client-side
  const filtered = useMemo(() => {
    return allContracts.filter(c => {
      if (typeFilter.length && !typeFilter.includes(c.type)) return false;
      if (dateFrom && c.startDate < dateFrom) return false;
      if (dateTo   && c.startDate > dateTo)   return false;
      return true;
    });
  }, [allContracts, typeFilter, dateFrom, dateTo]);

  const active     = filtered.filter(c => c.status === 'نشط').length;
  const totalValue = filtered.reduce((s, c) => s + Number(c.amount), 0);
  const expiringSoon = reportData?.expiring_soon ?? 0;

  // Monthly chart requires a dedicated endpoint — showing placeholder.
  const monthlyContractData = [
    { month: 'أكتوبر', rental: 0, sale: 0 },
    { month: 'نوفمبر', rental: 0, sale: 0 },
    { month: 'ديسمبر', rental: 0, sale: 0 },
    { month: 'يناير',  rental: 0, sale: 0 },
    { month: 'فبراير', rental: 0, sale: 0 },
    { month: 'مارس',   rental: 0, sale: 0 },
  ];

  const now             = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const isExpiringSoon  = (endDate: string) => {
    if (endDate === '—') return false;
    const end = new Date(endDate);
    return end <= thirtyDaysLater && end >= now;
  };

  const handleExport = () => {
    const filters: string[] = [];
    if (typeFilter.length)   filters.push(`نوع العقد: ${typeFilter.join('، ')}`);
    if (statusFilter.length) filters.push(`الحالة: ${statusFilter.join('، ')}`);
    if (dateFrom) filters.push(`من: ${dateFrom}`);
    if (dateTo)   filters.push(`إلى: ${dateTo}`);
    exportReportPDF('تقرير العقود', filters,
      [{ header: 'رقم العقد', key: 'num' }, { header: 'النوع', key: 'type' }, { header: 'العقار', key: 'prop' }, { header: 'القيمة', key: 'amt' }, { header: 'الحالة', key: 'status' }],
      filtered.map(c => ({ num: c.number, type: c.type, prop: c.property, amt: `${c.amount.toLocaleString()} د.ك`, status: c.status })),
      [{ label: 'إجمالي العقود', value: filtered.length.toString() }, { label: 'النشطة', value: active.toString() }, { label: 'إجمالي القيمة', value: `${totalValue.toLocaleString()} د.ك` }]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-end">
        <MultiSearchableSelect
          className="w-36"
          placeholder="نوع العقد"
          value={typeFilter}
          onValueChange={setTypeFilter}
          options={['إيجار', 'بيع']}
        />
        <MultiSearchableSelect
          className="w-36"
          placeholder="الحالة"
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={contractStatuses}
        />
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">من</label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">إلى</label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
        </div>
        <ResetFiltersButton show={hasActiveFilters} onReset={resetFilters} spacer={false} />
        <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4 ml-1" />تصدير PDF</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">إجمالي العقود</p><p className="text-2xl font-bold">{loading ? '…' : filtered.length}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">العقود النشطة</p><p className="text-2xl font-bold text-green-600">{active}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">إجمالي قيمة العقود</p><p className="text-2xl font-bold">{totalValue.toLocaleString()} د.ك</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">تنتهي قريباً</p><p className="text-2xl font-bold">{expiringSoon > 0 ? <><span>{expiringSoon}</span><Badge className="mr-2 bg-red-100 text-red-800">{expiringSoon}</Badge></> : expiringSoon}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم العقد</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>العقار</TableHead>
                <TableHead>الطرف الثاني</TableHead>
                <TableHead>القيمة</TableHead>
                <TableHead>تاريخ البدء/العقد</TableHead>
                <TableHead>تاريخ الانتهاء/التسليم</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">جاري التحميل...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">لا توجد بيانات</TableCell></TableRow>
              ) : filtered.map(c => (
                <TableRow key={c.id} className={c.endDate !== '—' && isExpiringSoon(c.endDate) ? 'border-r-4 border-r-amber-500' : ''}>
                  <TableCell className="font-medium">{c.number}</TableCell>
                  <TableCell><Badge className={c.type === 'إيجار' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}>{c.type}</Badge></TableCell>
                  <TableCell>{c.property}</TableCell>
                  <TableCell>{c.party}</TableCell>
                  <TableCell className="font-bold">{c.amount.toLocaleString()} د.ك</TableCell>
                  <TableCell>{c.startDate}</TableCell>
                  <TableCell>{c.endDate}</TableCell>
                  <TableCell><Badge className={contractStatusColors[c.status] || ''}>{c.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">قيمة العقود الشهرية</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={monthlyContractData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="rental" name="إيجار" stroke="#1E40AF" fill="#1E40AF" fillOpacity={0.2} />
              <Area type="monotone" dataKey="sale"   name="بيع"   stroke="#16A34A" fill="#16A34A" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

// ======== TAB 5: Clients Report ========
const ClientsReportTab = () => {
  const [typeFilter,   setTypeFilter]   = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [reportData, setReportData] = useState<ClientsReportData | null>(null);
  const hasActiveFilters = [typeFilter, statusFilter].some(f => f.length > 0);
  const resetFilters = () => {
    setTypeFilter([]);
    setStatusFilter([]);
  };
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    reportsService.clients({
      type:   typeFilter,
      status: statusFilter,
    })
      .then(setReportData)
      .catch(() => setReportData(null))
      .finally(() => setLoading(false));
  }, [typeFilter, statusFilter]);

  const clients          = reportData?.clients ?? [];
  const individuals      = clients.filter(c => c.type === 'فرد').length;
  const companies        = clients.filter(c => c.type === 'شركة').length;
  const brokers          = clients.filter(c => c.type === 'وسيط').length;
  const propertyManagers = clients.filter(c => c.type === 'مسؤول العقار').length;

  const topClients = useMemo(() => {
    return clients
      .map(c => ({
        name:        c.full_name,
        requests:    c.requests_count,
        contracts:   c.rental_contracts_count + c.sale_contracts_count,
        collections: c.collections_count,
        total:       c.requests_count + c.rental_contracts_count + c.sale_contracts_count + c.collections_count,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [clients]);

  const handleExport = () => {
    const filters: string[] = [];
    if (typeFilter.length)   filters.push(`النوع: ${typeFilter.join('، ')}`);
    if (statusFilter.length) filters.push(`الحالة: ${statusFilter.join('، ')}`);
    exportReportPDF('تقرير العملاء', filters,
      [{ header: '#', key: 'idx' }, { header: 'الاسم', key: 'name' }, { header: 'الهاتف', key: 'phone' }, { header: 'النوع', key: 'type' }, { header: 'الحالة', key: 'status' }],
      clients.map((c, i) => ({ idx: String(i + 1), name: c.full_name, phone: c.phone, type: c.type, status: c.status })),
      [
        { label: 'إجمالي العملاء', value: clients.length.toString() },
        { label: 'الأفراد',        value: individuals.toString() },
        { label: 'الشركات',        value: companies.toString() },
        { label: 'الوسطاء',        value: brokers.toString() },
        { label: 'مسؤولو العقار',  value: propertyManagers.toString() },
      ]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-end">
        <MultiSearchableSelect
          className="w-36"
          placeholder="النوع"
          value={typeFilter}
          onValueChange={setTypeFilter}
          options={CLIENT_TYPES}
        />
        <MultiSearchableSelect
          className="w-36"
          placeholder="الحالة"
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={['نشط', 'غير نشط']}
        />
        <ResetFiltersButton show={hasActiveFilters} onReset={resetFilters} spacer={false} />
        <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4 ml-1" />تصدير PDF</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">إجمالي العملاء</p><p className="text-2xl font-bold">{loading ? '…' : clients.length}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">الأفراد</p><p className="text-2xl font-bold">{individuals}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">الشركات</p><p className="text-2xl font-bold">{companies}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">الوسطاء</p><p className="text-2xl font-bold">{brokers}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">مسؤولو العقار</p><p className="text-2xl font-bold">{propertyManagers}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead>رقم الهاتف</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>عدد الطلبات</TableHead>
                <TableHead>عدد العقود</TableHead>
                <TableHead>تاريخ الإضافة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">جاري التحميل...</TableCell></TableRow>
              ) : clients.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">لا توجد بيانات</TableCell></TableRow>
              ) : clients.map((c, i) => (
                <TableRow key={c.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{c.full_name}</TableCell>
                  <TableCell dir="ltr" className="text-right">{c.phone}</TableCell>
                  <TableCell><Badge variant="outline">{c.type}</Badge></TableCell>
                  <TableCell><Badge className={c.status === 'نشط' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>{c.status}</Badge></TableCell>
                  <TableCell>{c.requests_count}</TableCell>
                  <TableCell>{c.rental_contracts_count + c.sale_contracts_count}</TableCell>
                  <TableCell>{c.created_at}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">أكثر العملاء نشاطاً</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topClients} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={120} />
              <Tooltip />
              <Bar dataKey="total" name="عدد المعاملات" fill="#1E40AF" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

// ======== MAIN REPORTS PAGE ========
const ReportsPage = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">التقارير والإحصائيات</h1>

      <Tabs defaultValue="summary" className="w-full" dir="rtl">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted p-1">
          <TabsTrigger value="summary">ملخص عام</TabsTrigger>
          <TabsTrigger value="collections">تقرير التحصيلات</TabsTrigger>
          <TabsTrigger value="properties">تقرير العقارات</TabsTrigger>
          <TabsTrigger value="contracts">تقرير العقود</TabsTrigger>
          <TabsTrigger value="clients">تقرير العملاء</TabsTrigger>
        </TabsList>

        <TabsContent value="summary"><GeneralSummaryTab /></TabsContent>
        <TabsContent value="collections"><CollectionsReportTab /></TabsContent>
        <TabsContent value="properties"><PropertiesReportTab /></TabsContent>
        <TabsContent value="contracts"><ContractsReportTab /></TabsContent>
        <TabsContent value="clients"><ClientsReportTab /></TabsContent>
      </Tabs>
    </div>
  );
};

export default ReportsPage;
