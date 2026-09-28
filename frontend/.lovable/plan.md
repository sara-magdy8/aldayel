

# إصلاح التصميم المتجاوب للموبايل والتابلت

## المشكلة
القائمة الجانبية تستخدم `useIsMobile()` (breakpoint 768px) بدلاً من CSS breakpoints، والـ sidebar ثابت بـ `fixed` مما قد يسبب مشاكل. الجداول والفلاتر تحتاج تحسينات إضافية.

## التغييرات

### 1. `src/components/AppLayout.tsx` — إعادة بناء كامل
استبدال Layout بالنسخة المقدمة من المستخدم مع التعديلات التالية:
- إزالة `useIsMobile()` hook واستخدام CSS classes (`hidden lg:flex`, `lg:hidden`)
- Desktop sidebar: `hidden lg:flex` بدلاً من شرط JS
- Mobile sidebar: overlay + drawer بـ `transform translate-x` animation
- إضافة زر إغلاق (X) داخل sidebar للموبايل
- Main content: `flex-1 min-w-0 overflow-hidden` لمنع التدافع
- الحفاظ على رابط "دليل المستخدم" (BookOpen) الموجود حالياً في navItems
- الحفاظ على نفس الألوان (#1E3A5F, #1E40AF) والنصوص العربية

### 2. جميع Drawer components (8 ملفات) — تحسين عرض الموبايل
تغيير `className="w-[520px] max-w-full"` إلى `className="w-full sm:w-[520px]"`:
- `PropertyFormDrawer.tsx`
- `PropertyViewDrawer.tsx`
- `RentalContractFormDrawer.tsx`
- `RentalContractViewDrawer.tsx`
- `SaleContractFormDrawer.tsx`
- `SaleContractViewDrawer.tsx`
- `CollectionFormDrawer.tsx`
- `CollectionViewDrawer.tsx`
- `ClientViewDrawer.tsx`
- `RequestViewDrawer.tsx`

### 3. Dialog components (3 ملفات) — إضافة responsive width
- `ClientFormDialog.tsx`: `className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto"`
- `RequestFormDialog.tsx`: `className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto"`
- `QuickAddClientDialog.tsx`: `className="w-[95vw] sm:max-w-md"`

### 4. الصفحات الداخلية — تأكيد responsive (معظمها تم سابقاً)
التحقق من أن جميع الصفحات تحتوي على:
- `overflow-x-auto` حول الجداول
- فلاتر `w-full md:w-XX`
- Headers `flex-col sm:flex-row`
- Stats grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-X`

## ما لن يتغير
- محتوى الصفحات والبيانات والألوان والنصوص العربية
- هيكل التوجيه (routing)
- المكونات الداخلية لـ shadcn/ui
- Mock data وTypes
- وظائف PDF

