import { Client, ClientRequest } from '@/types';

export const mockClients: Client[] = [
  { id: 'c1', full_name: 'محمد عبدالله الرشيد', phone: '965-5001-2345', email: 'mohammed@email.com', type: 'فرد', status: 'نشط', created_at: '2024-01-10' },
  { id: 'c2', full_name: 'شركة الخليج للاستثمار', phone: '965-2222-1111', email: 'info@gulf-invest.com', type: 'شركة', status: 'نشط', created_at: '2024-01-15' },
  { id: 'c3', full_name: 'فاطمة يوسف المطيري', phone: '965-5512-8890', type: 'فرد', status: 'نشط', created_at: '2024-02-01' },
  { id: 'c4', full_name: 'عبدالعزيز سالم العنزي', phone: '965-6600-4321', email: 'abdulaziz@email.com', type: 'فرد', status: 'نشط', created_at: '2024-02-10' },
  { id: 'c5', full_name: 'مؤسسة النور التجارية', phone: '965-2345-6789', email: 'noor@company.com', type: 'شركة', status: 'غير نشط', created_at: '2024-02-20' },
  { id: 'c6', full_name: 'نورة خالد الحربي', phone: '965-5678-1234', type: 'فرد', status: 'نشط', created_at: '2024-03-05' },
  { id: 'c7', full_name: 'سعد محمد البلوشي', phone: '965-9900-3344', email: 'saad@email.com', type: 'فرد', status: 'نشط', created_at: '2024-03-15' },
  { id: 'c8', full_name: 'شركة الأفق العقارية', phone: '965-2211-5566', email: 'info@ofuq.com', type: 'شركة', status: 'نشط', created_at: '2024-04-01' },
  { id: 'c9', full_name: 'منى عيسى الشمري', phone: '965-5544-7788', type: 'فرد', status: 'نشط', created_at: '2024-04-20' },
  { id: 'c10', full_name: 'جاسم علي العجمي', phone: '965-6677-2233', email: 'jasem@email.com', type: 'فرد', status: 'نشط', created_at: '2024-05-01' },
];

export const mockRequests: ClientRequest[] = [
  { id: 'r1', client_id: 'c1', client_name: 'محمد عبدالله الرشيد', client_phone: '965-5001-2345', request_type: 'إيجار', category: 'شقة', region: 'السالمية', area: 80, status: 'جديد', created_at: '2024-06-01' },
  { id: 'r2', client_id: 'c2', client_name: 'شركة الخليج للاستثمار', client_phone: '965-2222-1111', request_type: 'شراء', category: 'مكتب', region: 'حولي', location: 'شارع تونس', area: 120, broker: 'أحمد الوسيط', status: 'قيد المتابعة', created_at: '2024-06-05' },
  { id: 'r3', client_id: 'c3', client_name: 'فاطمة يوسف المطيري', client_phone: '965-5512-8890', request_type: 'إيجار', category: 'دكان', region: 'الفروانية', status: 'مكتمل', created_at: '2024-05-20' },
  { id: 'r4', client_id: 'c4', client_name: 'عبدالعزيز سالم العنزي', client_phone: '965-6600-4321', request_type: 'شراء', category: 'أرض', region: 'الجهراء', area: 500, notes: 'أرض للبناء السكني', status: 'جديد', created_at: '2024-06-10' },
  { id: 'r5', client_id: 'c6', client_name: 'نورة خالد الحربي', client_phone: '965-5678-1234', request_type: 'إيجار', category: 'شقة', region: 'الرميثية', area: 100, status: 'قيد المتابعة', created_at: '2024-06-12' },
  { id: 'r6', client_id: 'c7', client_name: 'سعد محمد البلوشي', client_phone: '965-9900-3344', request_type: 'شراء', category: 'مستودع', region: 'الشويخ', area: 300, broker: 'سالم المطوع', status: 'جديد', created_at: '2024-06-15' },
  { id: 'r7', client_id: 'c9', client_name: 'منى عيسى الشمري', client_phone: '965-5544-7788', request_type: 'إيجار', category: 'محل', region: 'العقيلة', status: 'قيد المتابعة', created_at: '2024-06-18' },
  { id: 'r8', client_id: 'c10', client_name: 'جاسم علي العجمي', client_phone: '965-6677-2233', request_type: 'شراء', category: 'شقة', region: 'بيان', area: 90, status: 'مكتمل', created_at: '2024-06-20' },
];
