# نظام إدارة مكتب العقارات

نظام متكامل لإدارة مكاتب العقارات، مبني بتقنيات حديثة مع واجهة عربية كاملة (RTL).

## التقنيات المستخدمة

- **React 18** + **TypeScript** — واجهة المستخدم
- **Vite** — أداة البناء والتطوير
- **Tailwind CSS** — التنسيق والتصميم
- **shadcn/ui** — مكونات واجهة المستخدم
- **recharts** — الرسوم البيانية والتقارير
- **jsPDF** — تصدير العقود والفواتير كملفات PDF
- **React Router** — التوجيه بين الصفحات
- **Lucide React** — الأيقونات

## هيكل المشروع

```
src/
├── components/       # المكونات المشتركة (النماذج، العارضات، الحوارات)
│   ├── ui/           # مكونات shadcn/ui
│   ├── AppLayout.tsx  # التخطيط الرئيسي مع القائمة الجانبية
│   └── ...
├── data/             # البيانات التجريبية
│   ├── mockProperties.ts
│   ├── mockClients.ts
│   ├── mockContracts.ts
│   └── mockCollections.ts
├── lib/              # أدوات مساعدة
│   ├── contractPdf.ts
│   ├── invoicePdf.ts
│   └── reportPdf.ts
├── pages/            # صفحات التطبيق
│   ├── DashboardPage.tsx
│   ├── RentalPropertiesPage.tsx
│   ├── SalePropertiesPage.tsx
│   ├── UnitsPage.tsx
│   ├── ClientsPage.tsx
│   ├── RequestsPage.tsx
│   ├── RentalContractsPage.tsx
│   ├── SaleContractsPage.tsx
│   ├── CollectionsPage.tsx
│   ├── ReportsPage.tsx
│   ├── SettingsPage.tsx
│   └── UserGuidePage.tsx
└── types/            # أنواع TypeScript
    └── index.ts
```

## المراحل المبنية

| المرحلة | الوصف |
|---------|-------|
| 1 | لوحة التحكم وتسجيل الدخول والتخطيط الرئيسي |
| 2 | إدارة العقارات (إيجار/بيع) والوحدات والعرض العام |
| 3 | إدارة العملاء والطلبات |
| 4 | عقود الإيجار والبيع مع تصدير PDF |
| 5 | التحصيل المالي وفواتير PDF |
| 6 | التقارير والإحصائيات والإعدادات |

## التشغيل المحلي

```bash
npm install
npm run dev
```

يعمل التطبيق على `http://localhost:5173`

## ملاحظات

- التطبيق يعمل بالكامل على جانب العميل (Client-side) بدون خادم خلفي
- البيانات تجريبية بأسماء عربية وعناوين كويتية
- جميع النصوص باللغة العربية مع دعم كامل لـ RTL
- خط Tajawal مستخدم في جميع أنحاء التطبيق
