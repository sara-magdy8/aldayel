import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Building2, MapPin, Phone, ImageOff, Loader2, ChevronLeft, ChevronRight, X, Instagram } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { publicViewService, PublicView } from '@/services/publicView';
import { settingsService } from '@/services/settings';

/**
 * Uniform thumbnail grid. Every image is cropped to a square tile so the row
 * stays even regardless of the original aspect ratios; clicking one opens the
 * lightbox on that image.
 */
const ImageGrid = ({ images, alt, onOpen }: { images: string[]; alt: string; onOpen: (index: number) => void }) => (
  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
    {images.map((src, i) => (
      <button
        key={i}
        type="button"
        onClick={() => onOpen(i)}
        aria-label={`عرض صورة ${i + 1} من ${images.length}`}
        className="group relative aspect-square overflow-hidden rounded-lg border bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        <img
          src={src}
          alt={`${alt} — صورة ${i + 1}`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-110"
        />
        <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
      </button>
    ))}
  </div>
);

/**
 * Full-screen viewer opened from the thumbnail grid. Navigates with the on-screen
 * arrows, the thumbnail strip, or the keyboard (Esc to close, ← / → to move).
 */
const ImageLightbox = ({
  images,
  alt,
  index,
  onIndexChange,
  onClose,
}: {
  images: string[];
  alt: string;
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) => {
  const go = (delta: number) => onIndexChange((index + delta + images.length) % images.length);

  // Keyboard control, plus a body scroll lock so the page behind stays put.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // The arrow keys follow the visual layout: in RTL, ← advances.
      else if (e.key === 'ArrowLeft') go(1);
      else if (e.key === 'ArrowRight') go(-1);
    };

    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="معرض الصور"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
    >
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        aria-label="إغلاق"
        className="absolute top-4 left-4 bg-white/10 hover:bg-white/25 text-white rounded-full p-2 transition-colors"
      >
        <X size={22} />
      </button>

      {/* Counter */}
      {images.length > 1 && (
        <div className="absolute top-5 right-4 bg-white/10 text-white text-sm rounded-full px-3 py-1" dir="ltr">
          {index + 1} / {images.length}
        </div>
      )}

      {/* Stop propagation so clicking the image itself does not close the overlay. */}
      <img
        src={images[index]}
        alt={`${alt} — صورة ${index + 1}`}
        onClick={e => e.stopPropagation()}
        className="max-h-[75vh] max-w-full object-contain rounded-lg"
      />

      {images.length > 1 && (
        <>
          {/* In RTL the previous image sits to the right and the next to the left. */}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); go(-1); }}
            aria-label="السابق"
            className="absolute top-1/2 right-3 -translate-y-1/2 bg-white/10 hover:bg-white/25 text-white rounded-full p-3 transition-colors"
          >
            <ChevronRight size={26} />
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); go(1); }}
            aria-label="التالي"
            className="absolute top-1/2 left-3 -translate-y-1/2 bg-white/10 hover:bg-white/25 text-white rounded-full p-3 transition-colors"
          >
            <ChevronLeft size={26} />
          </button>

          {/* Thumbnail strip — jump straight to any image. */}
          <div
            onClick={e => e.stopPropagation()}
            className="mt-4 flex gap-2 overflow-x-auto max-w-full px-2 pb-1"
          >
            {images.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onIndexChange(i)}
                aria-label={`صورة ${i + 1}`}
                aria-current={i === index}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-opacity ${i === index ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-90'
                  }`}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const PublicViewPage = () => {
  const { token } = useParams<{ token: string }>();

  const [data, setData] = useState<PublicView | null>(null);
  const [loading, setLoading] = useState(true);
  // Office branding for the header. Uses the public endpoint — this page is
  // viewed by clients who are not logged in.
  const [officeName, setOfficeName] = useState<string | null>(null);
  const [officeLogo, setOfficeLogo] = useState<string | null>(null);
  // Index of the image shown in the lightbox; null while it is closed.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    publicViewService.get(token)
      .then(res => { if (active) setData(res); })
      .catch(() => { if (active) setData(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  // Branding does not depend on the token, so it loads once on mount rather than
  // alongside the listing.
  useEffect(() => {
    let active = true;
    settingsService
      .branding()
      .then(b => {
        if (!active) return;
        setOfficeName(b.office_name);
        setOfficeLogo(b.office_logo);
      })
      .catch(() => {
        // Branding is optional — fall back to the default icon/title.
      });
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <Loader2 size={40} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="text-center space-y-4">
          <ImageOff size={64} className="mx-auto text-muted-foreground" />
          <h1 className="text-2xl font-bold text-foreground">هذا الرابط غير متاح</h1>
          <p className="text-muted-foreground">الرابط الذي تحاول الوصول إليه غير مفعل أو غير موجود</p>
        </div>
      </div>
    );
  }

  const isUnit = data.type === 'unit';
  // بيع = sale, إيجار = rental — carried by both properties and units.
  // Both show المواصفات / الشروط; فترة السماح is rental-only.
  const isRental = data.listing_type === 'إيجار';
  const displayName = isUnit ? data.unit_number : data.name;
  const displayType = isUnit ? data.unit_type : data.category;
  const displayPriceLabel = 'السعر';

  // Public-facing status normalised by the backend to متاح / محجوز.
  const publicStatus = data.status === 'متاح' ? 'متاح' : data.status === 'محجوز' ? 'محجوز' : null;
  const statusColor = publicStatus === 'متاح' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800';

  const images = data.images ?? [];

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Top bar */}
      <header className="h-16 bg-card border-b flex items-center px-6">
        {officeLogo ? (
          <img
            src={officeLogo}
            alt={officeName ?? 'شعار المكتب'}
            className="h-8 w-8 ml-3 rounded object-contain"
          />
        ) : (
          <Building2 size={24} className="text-primary ml-3" />
        )}
        <span className="font-bold text-lg text-foreground">{officeName ?? 'مكتب العقارات'}</span>
      </header>

      {/* Gallery */}
      {images.length > 0 && (
        <div className="max-w-2xl mx-auto px-6 pt-6">
          <ImageGrid images={images} alt={displayName} onOpen={setLightboxIndex} />
        </div>
      )}

      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          alt={displayName}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">{displayName}</h1>
              {displayType && <Badge variant="secondary">{displayType}</Badge>}
              {publicStatus && <Badge variant="secondary" className={statusColor}>{publicStatus}</Badge>}
            </div>

            {/* Marketing post — only rendered when the property has one. */}
            {data.instagram_link && (
              <a
                href={data.instagram_link}
                target="_blank"
                rel="noopener noreferrer"
                className="block pt-2"
              >
                <Button className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                  <Instagram size={16} />
                  شاهد العقار
                </Button>
              </a>
            )}

            {data.location_link && (
              <a href={data.location_link} target="_blank" rel="noopener noreferrer" className="block mb-4">
                <Button size="sm" className="w-full gap-1 bg-success/10 text-success border-2 border-dotted border-success hover:bg-success/20">
                  <MapPin size={14} />
                  شاهد الموقع
                </Button>
              </a>
            )}

            <div className="grid gap-4">
              {!isUnit && data.property_type && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">نوع العقار</span>
                  <span className="font-medium">{data.property_type}</span>
                </div>
              )}

              {/* Units show the parent property's activity instead of a category. */}
              {!isUnit && displayType && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">التصنيف</span>
                  <span className="font-medium">{displayType}</span>
                </div>
              )}

              {data.activity && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">النشاط</span>
                  <span className="font-medium">{data.activity}</span>
                </div>
              )}

              {data.area && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">المساحة</span>
                  <span className="font-medium">{data.area} م²</span>
                </div>
              )}

              {isUnit && data.rooms_count != null && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">عدد الغرف</span>
                  <span className="font-medium">{data.rooms_count}</span>
                </div>
              )}

              {data.price != null && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">{displayPriceLabel}</span>
                  <span className="font-bold text-primary text-lg">{data.price.toLocaleString()} د.ك</span>
                </div>
              )}

              {isRental && data.grace_period != null && data.grace_period !== '' && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">فترة السماح</span>
                  <span className="font-medium">{data.grace_period}</span>
                </div>
              )}

              {data.address && (
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">العنوان</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{data.address}</span>
                  </div>
                </div>
              )}

              {data.contact && (
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">رقم التواصل</span>
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-muted-foreground" />
                    <span className="font-medium" dir="ltr">{data.contact}</span>
                  </div>
                </div>
              )}
              {/* مسؤول العقار and الوسيط (names + phones) are intentionally
                  not shown publicly. */}
            </div>

            {data.description && (
              <div className="pt-2">
                <h3 className="font-bold text-sm mb-2">الوصف والمواصفات</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{data.description}</p>
              </div>
            )}

            {data.conditions && (
              <div className="pt-2">
                <h3 className="font-bold text-sm mb-2">{isRental ? 'شروط الإيجار' : 'شروط البيع'}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{data.conditions}</p>
              </div>
            )}

          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PublicViewPage;
