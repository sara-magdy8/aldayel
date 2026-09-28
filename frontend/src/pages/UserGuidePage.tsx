import { BookOpen, LayoutDashboard, Building2, Users, FileText, Banknote, BarChart3, Settings, ClipboardList, Globe, Construction } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const UserGuidePage = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full" style={{ backgroundColor: "#DBEAFE" }}>
              <BookOpen size={40} style={{ color: "#1E40AF" }} />
            </div>
          </div>
          <CardTitle className="text-2xl">دليل المستخدم</CardTitle>
          <p className="text-muted-foreground mt-2">
            دليل شامل لاستخدام نظام إدارة مكتب العقارات. يشرح جميع الوظائف والميزات المتاحة في كل قسم.
          </p>
        </CardHeader>
      </Card>

      {/* Guide Sections */}
      <Card>
        <CardContent className="pt-6">
          <Accordion type="multiple" className="w-full">
            {/* Dashboard */}
            <AccordionItem value="dashboard">
              <AccordionTrigger>
                <div className="flex items-center gap-3">
                  <LayoutDashboard size={20} style={{ color: "#1E40AF" }} />
                  <span className="font-bold">لوحة التحكم</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pr-8">
                  <p className="text-muted-foreground leading-relaxed">
                    لوحة التحكم هي الصفحة الرئيسية التي تظهر بعد تسجيل الدخول، وتعرض ملخصاً شاملاً لحالة المكتب.
                  </p>
                  <Separator />
                  <h4 className="font-semibold">العناصر المعروضة:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>بطاقات إحصائية سريعة (إجمالي العقارات، العملاء، العقود النشطة، الإيرادات)</li>
                    <li>رسم بياني للإيرادات الشهرية</li>
                    <li>آخر العقود المضافة</li>
                    <li>حالة العقارات (متاح، محجوز، مؤجر، مباع)</li>
                  </ul>
                  <div className="flex gap-2 flex-wrap mt-2">
                    <Badge variant="outline" className="text-xs">عرض فقط</Badge>
                    <Badge variant="outline" className="text-xs">تحديث تلقائي</Badge>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Properties */}
            <AccordionItem value="properties">
              <AccordionTrigger>
                <div className="flex items-center gap-3">
                  <Building2 size={20} style={{ color: "#1E40AF" }} />
                  <span className="font-bold">إدارة العقارات والوحدات</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pr-8">
                  <p className="text-muted-foreground leading-relaxed">
                    يتيح النظام إدارة عقارات الإيجار وعقارات البيع بشكل منفصل، مع إمكانية إضافة وحدات لكل عقار.
                  </p>
                  <Separator />

                  <h4 className="font-semibold">عقارات الإيجار / البيع:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li><strong>إضافة عقار:</strong> اضغط زر "إضافة عقار" واملأ البيانات (الاسم، العنوان، التصنيف، المالك، السعر، الحالة)</li>
                    <li><strong>تعديل عقار:</strong> اضغط أيقونة التعديل في الجدول لفتح نموذج التعديل</li>
                    <li><strong>حذف عقار:</strong> اضغط أيقونة الحذف وأكد العملية</li>
                    <li><strong>عرض التفاصيل:</strong> اضغط على اسم العقار لفتح لوحة التفاصيل الجانبية</li>
                    <li><strong>البحث والفلترة:</strong> استخدم حقل البحث والفلاتر لتصفية النتائج</li>
                  </ul>

                  <Separator />
                  <h4 className="font-semibold">إدارة الوحدات:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li><strong>الوصول:</strong> اضغط زر "الوحدات" بجانب أي عقار للانتقال لصفحة وحداته</li>
                    <li><strong>إضافة وحدة:</strong> اضغط "إضافة وحدة" واملأ البيانات (رقم الوحدة، النوع، المساحة، السعر)</li>
                    <li><strong>تعديل/حذف:</strong> نفس أيقونات التعديل والحذف</li>
                  </ul>

                  <Separator />
                  <h4 className="font-semibold">حالات العقارات:</h4>
                  <div className="flex gap-2 flex-wrap">
                    <Badge className="text-white" style={{ backgroundColor: "#16A34A" }}>متاح</Badge>
                    <Badge className="text-white" style={{ backgroundColor: "#D97706" }}>محجوز</Badge>
                    <Badge className="text-white" style={{ backgroundColor: "#2563EB" }}>مؤجر</Badge>
                    <Badge className="text-white" style={{ backgroundColor: "#6B7280" }}>مباع</Badge>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Public View */}
            <AccordionItem value="public-view">
              <AccordionTrigger>
                <div className="flex items-center gap-3">
                  <Globe size={20} style={{ color: "#1E40AF" }} />
                  <span className="font-bold">العرض العام للعقارات</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pr-8">
                  <p className="text-muted-foreground leading-relaxed">
                    يمكنك مشاركة رابط عام لأي عقار مع العملاء دون الحاجة لتسجيل الدخول.
                  </p>
                  <Separator />
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li><strong>إنشاء رابط:</strong> من صفحة تفاصيل العقار، اضغط "مشاركة" للحصول على رابط عام</li>
                    <li><strong>المحتوى:</strong> يعرض الرابط معلومات العقار والوحدات المتاحة بتصميم بسيط</li>
                    <li><strong>الأمان:</strong> الرابط للعرض فقط ولا يتيح أي تعديل</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Clients */}
            <AccordionItem value="clients">
              <AccordionTrigger>
                <div className="flex items-center gap-3">
                  <Users size={20} style={{ color: "#1E40AF" }} />
                  <span className="font-bold">إدارة العملاء</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pr-8">
                  <p className="text-muted-foreground leading-relaxed">
                    إدارة بيانات العملاء (مستأجرين، مشترين، ملاك) مع إمكانية البحث والفلترة.
                  </p>
                  <Separator />
                  <h4 className="font-semibold">العمليات المتاحة:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li><strong>إضافة عميل:</strong> اضغط "إضافة عميل" واملأ البيانات (الاسم، الهاتف، البريد، النوع، الرقم المدني)</li>
                    <li><strong>تعديل/حذف:</strong> من أيقونات الإجراءات في الجدول</li>
                    <li><strong>عرض التفاصيل:</strong> اضغط على اسم العميل لعرض كامل بياناته</li>
                    <li><strong>الفلترة:</strong> حسب نوع العميل (مستأجر، مشتري، مالك) أو حسب الحالة</li>
                    <li><strong>إضافة سريعة:</strong> يمكن إضافة عميل بسرعة من نموذج مختصر عند إنشاء عقد</li>
                  </ul>

                  <Separator />
                  <h4 className="font-semibold">أنواع العملاء:</h4>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline">مستأجر</Badge>
                    <Badge variant="outline">مشتري</Badge>
                    <Badge variant="outline">مالك</Badge>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Requests */}
            <AccordionItem value="requests">
              <AccordionTrigger>
                <div className="flex items-center gap-3">
                  <ClipboardList size={20} style={{ color: "#1E40AF" }} />
                  <span className="font-bold">إدارة الطلبات</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pr-8">
                  <p className="text-muted-foreground leading-relaxed">
                    تتبع طلبات العملاء للإيجار أو الشراء مع عرض كانبان لمتابعة حالة كل طلب.
                  </p>
                  <Separator />
                  <h4 className="font-semibold">العمليات المتاحة:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li><strong>إضافة طلب:</strong> اضغط "إضافة طلب" وحدد العميل ونوع الطلب والميزانية والمواصفات المطلوبة</li>
                    <li><strong>عرض كانبان:</strong> الطلبات معروضة في أعمدة حسب الحالة (جديد، قيد المتابعة، مكتمل)</li>
                    <li><strong>تغيير الحالة:</strong> يمكن تعديل حالة الطلب من نموذج التعديل</li>
                    <li><strong>عرض التفاصيل:</strong> اضغط على بطاقة الطلب لعرض كامل التفاصيل</li>
                  </ul>

                  <Separator />
                  <h4 className="font-semibold">حالات الطلبات:</h4>
                  <div className="flex gap-2 flex-wrap">
                    <Badge className="text-white" style={{ backgroundColor: "#D97706" }}>جديد</Badge>
                    <Badge className="text-white" style={{ backgroundColor: "#2563EB" }}>قيد المتابعة</Badge>
                    <Badge className="text-white" style={{ backgroundColor: "#16A34A" }}>مكتمل</Badge>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Rental Contracts */}
            <AccordionItem value="contracts">
              <AccordionTrigger>
                <div className="flex items-center gap-3">
                  <FileText size={20} style={{ color: "#1E40AF" }} />
                  <span className="font-bold">عقود الإيجار والبيع</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pr-8">
                  <p className="text-muted-foreground leading-relaxed">
                    إنشاء وإدارة عقود الإيجار والبيع مع إمكانية تصدير العقد كملف PDF.
                  </p>
                  <Separator />

                  <h4 className="font-semibold">عقود الإيجار:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li><strong>إنشاء عقد:</strong> حدد العقار والوحدة والمستأجر، وأدخل تاريخ البداية والنهاية وقيمة الإيجار</li>
                    <li><strong>فترة الدفع:</strong> شهري، ربع سنوي، نصف سنوي، أو سنوي</li>
                    <li><strong>تصدير PDF:</strong> اضغط أيقونة PDF لتحميل نسخة من العقد</li>
                    <li><strong>تتبع الانتهاء:</strong> العقود القريبة من الانتهاء تظهر بتنبيه بصري</li>
                  </ul>

                  <Separator />
                  <h4 className="font-semibold">عقود البيع:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li><strong>إنشاء عقد:</strong> حدد العقار والمشتري وأدخل سعر البيع والعربون</li>
                    <li><strong>الدفعات:</strong> إمكانية تقسيم المبلغ على دفعات</li>
                    <li><strong>تصدير PDF:</strong> نفس آلية تصدير عقود الإيجار</li>
                  </ul>

                  <Separator />
                  <h4 className="font-semibold">حالات العقود:</h4>
                  <div className="flex gap-2 flex-wrap">
                    <Badge className="text-white" style={{ backgroundColor: "#16A34A" }}>نشط</Badge>
                    <Badge className="text-white" style={{ backgroundColor: "#D97706" }}>قيد الإنشاء</Badge>
                    <Badge className="text-white" style={{ backgroundColor: "#6B7280" }}>منتهي</Badge>
                    <Badge className="text-white" style={{ backgroundColor: "#DC2626" }}>ملغي</Badge>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Collections */}
            <AccordionItem value="collections">
              <AccordionTrigger>
                <div className="flex items-center gap-3">
                  <Banknote size={20} style={{ color: "#1E40AF" }} />
                  <span className="font-bold">التحصيل المالي والفواتير</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pr-8">
                  <p className="text-muted-foreground leading-relaxed">
                    تسجيل ومتابعة جميع التحصيلات المالية (إيجارات، عمولات، عربون، دفعات) مع تصدير الفواتير.
                  </p>
                  <Separator />
                  <h4 className="font-semibold">العمليات المتاحة:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li><strong>تسجيل تحصيل:</strong> اضغط "إضافة تحصيل" وحدد النوع والمبلغ وطريقة الدفع والمستفيد</li>
                    <li><strong>طرق الدفع:</strong> نقدي، تحويل بنكي، شيك، بطاقة (كل طريقة لها حقول إضافية)</li>
                    <li><strong>المستفيد:</strong> المكتب، المالك، أو الوسيط</li>
                    <li><strong>تصدير فاتورة:</strong> اضغط أيقونة الفاتورة لتحميل فاتورة PDF</li>
                    <li><strong>الفلترة:</strong> حسب التاريخ، النوع، المستفيد، أو طريقة الدفع</li>
                  </ul>

                  <Separator />
                  <h4 className="font-semibold">أنواع التحصيل:</h4>
                  <div className="flex gap-2 flex-wrap">
                    <Badge style={{ backgroundColor: "#7C3AED", color: "white" }}>عمولة</Badge>
                    <Badge style={{ backgroundColor: "#2563EB", color: "white" }}>إيجار</Badge>
                    <Badge style={{ backgroundColor: "#D97706", color: "white" }}>عربون</Badge>
                    <Badge style={{ backgroundColor: "#16A34A", color: "white" }}>دفعة نقدية</Badge>
                    <Badge style={{ backgroundColor: "#6B7280", color: "white" }}>أخرى</Badge>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Reports */}
            <AccordionItem value="reports">
              <AccordionTrigger>
                <div className="flex items-center gap-3">
                  <BarChart3 size={20} style={{ color: "#1E40AF" }} />
                  <span className="font-bold">التقارير والإحصائيات</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pr-8">
                  <p className="text-muted-foreground leading-relaxed">
                    تقارير شاملة مع رسوم بيانية وإمكانية التصدير كملفات PDF.
                  </p>
                  <Separator />
                  <h4 className="font-semibold">التقارير المتاحة:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li><strong>ملخص عام:</strong> نظرة شاملة بأرقام إحصائية ورسوم بيانية متنوعة</li>
                    <li><strong>تقرير التحصيلات:</strong> تفاصيل التحصيلات مع فلاتر ورسم بياني دائري</li>
                    <li><strong>تقرير العقارات:</strong> إحصائيات العقارات حسب التصنيف والحالة</li>
                    <li><strong>تقرير العقود:</strong> متابعة العقود مع تنبيهات الانتهاء القريب</li>
                    <li><strong>تقرير العملاء:</strong> تحليل نشاط العملاء وترتيبهم</li>
                  </ul>
                  <Separator />
                  <h4 className="font-semibold">ميزات التقارير:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>فلترة حسب التاريخ والنوع والحالة</li>
                    <li>رسوم بيانية تفاعلية (أعمدة، دائرية، مساحية)</li>
                    <li>تصدير كل تقرير كملف PDF</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Settings */}
            <AccordionItem value="settings">
              <AccordionTrigger>
                <div className="flex items-center gap-3">
                  <Settings size={20} style={{ color: "#1E40AF" }} />
                  <span className="font-bold">الإعدادات</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pr-8">
                  <p className="text-muted-foreground leading-relaxed">
                    إعدادات المكتب وإدارة التصنيفات وأنواع الوحدات.
                  </p>
                  <Separator />
                  <h4 className="font-semibold">الأقسام:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li><strong>معلومات المكتب:</strong> تعديل اسم المكتب، الهاتف، البريد الإلكتروني، العنوان، وتحميل الشعار</li>
                    <li><strong>تصنيفات العقارات:</strong> إضافة وحذف تصنيفات العقارات (شقة، فيلا، مكتب، إلخ)</li>
                    <li><strong>أنواع الوحدات:</strong> إضافة وحذف أنواع الوحدات (غرفة، صالة، مطبخ، إلخ)</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Footer */}
      <Card>
        <CardContent className="py-4 text-center">
          <p className="text-sm text-muted-foreground">
            نظام إدارة مكتب العقارات — الإصدار 1.0
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default UserGuidePage;
