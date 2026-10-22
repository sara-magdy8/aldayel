export type PropertyCategory = 'شقة' | 'محل' | 'مخزن' | 'عمارة' | 'أرض' | 'مستودع' | 'مكتب';
export type PropertyStatus = 'متاح' | 'محجوز' | 'مؤجر' | 'مباع';
export type ListingType = 'إيجار' | 'بيع';
export type PropertyType = 'مستقل' | 'متعدد الوحدات';

export interface Property {
  id: string;
  name: string;
  /** كود العقار — unique, required property reference code. */
  property_code: string;
  property_type: PropertyType;
  listing_type: ListingType;
  category: PropertyCategory;
  /** Who filmed/photographed the property — name from the filmed_by lookup. */
  filmed_by?: string;
  /** True when the property has a filmed_by set (filmed_by_id is not null). */
  is_filmed?: boolean;
  /** حالة البناء — name from the building_statuses lookup; عقارات البيع only. */
  building_status?: string;
  /** الأولوية — priority flag stored as a boolean column. */
  priority?: boolean;
  /** النشاط — activity names (many-to-many). A property can have several. */
  activities?: string[];
  /** النشاط — the activities joined into one string; read-only, for display. */
  activity?: string;
  owner_id?: string;
  owner_name: string;
  plot_number: string;
  area?: number;
  /** المحافظة — governorate id (structured location, replaces free-text address). */
  governorate_id?: number;
  /** المنطقة — area/district id, belongs to the selected governorate. */
  area_id?: number;
  /** اسم المحافظة — governorate name (read-only, from the lookup). */
  governorate?: string;
  /** اسم المنطقة — area name (read-only, from the lookup). */
  area_name?: string;
  /** Derived on the backend as "المحافظة - المنطقة"; kept for display/search. */
  address: string;
  location_link?: string;
  description?: string;
  /** اسم الحارس — guard name. */
  guard_name?: string;
  guard_phone?: string;
  /** الوسيط — id of the client (type 'وسيط') acting as broker. */
  broker_id?: string;
  /** مسؤول العقار — id of the client (type 'مسؤول العقار') managing the property. */
  manager_id?: string;
  /** الوسيط — broker name; read-only, resolved from the linked client. */
  broker_name?: string;
  /** رقم هاتف الوسيط — read-only, resolved from the linked client. */
  broker_phone_num?: string;
  /** مسؤول العقار — manager name; read-only, resolved from the linked client. */
  manager_name?: string;
  /** رقم هاتف مسؤول العقار — read-only, resolved from the linked client. */
  manager_phone_num?: string;
  /** بيانات التسويق — رابط للبيع (forsale.com listing link). */
  forsale_link?: string;
  /** بيانات التسويق — رابط انستقرام. */
  instagram_link?: string;
  /** بيانات التسويق — رابط واتساب. */
  whatsapp_link?: string;
  /** حالة التسويق — admin-set flag: تم / لم يتم. */
  marketing_status?: boolean;
  /** عقارات البيع — whether the property PDF prints the highest السوم. */
  show_soum_in_pdf?: boolean;
  commission?: number;
  notes?: string;
  status: PropertyStatus;
  rent_amount?: number;
  price?: number;
  conditions?: string;
  grace_period?: string;
  /** المستأجر — a client of type فرد / شركة. */
  tenant_id?: string;
  /** Read-only: resolved from the linked tenant client by the backend. */
  tenant_name?: string;
  tenant_start?: string;
  tenant_end?: string;
  sale_date?: string;
  attachments: string[];
  public_link_token: string;
  public_link_enabled: boolean;
  public_show_price: boolean;
  public_show_location: boolean;
  public_show_contact: boolean;
  /**
   * السوم summary for the list column. Only the list endpoint sends these —
   * anywhere else they are simply absent, hence optional.
   */
  soums_count?: number;
  /** أعلى سوم — its amount, and the date that bid was placed. */
  top_soum_amount?: number;
  top_soum_date?: string;
  created_at: string;
}

export type UnitStatus = 'متاح' | 'محجوز' | 'مؤجر' | 'مباع';
export type UnitType = 'شقة' | 'محل' | 'مكتب' | 'مستودع';

export interface Unit {
  id: string;
  property_id: string;
  unit_number: string;
  /** Optional — units added in bulk carry activities instead of a type. */
  unit_type?: UnitType | null;
  /** Activity names attached to the unit (activity_unit pivot). */
  activities?: string[];
  /** The activities joined into one string, as the backend appends it. */
  activity?: string | null;
  floor?: string;
  area?: number;
  rooms_count?: number;
  price?: number;
  listing_type: ListingType;
  status: UnitStatus;
  notes?: string;
  /** المواصفات — free text. */
  description?: string;
  /** الشروط — free text. */
  conditions?: string;
  /** فترة السماح — rental units only (listing_type === 'إيجار'). */
  grace_period?: string;
  images: string[];
  public_link_token: string;
  public_link_enabled: boolean;
  public_show_price: boolean;
  public_show_location: boolean;
  public_show_contact: boolean;
}

export type ClientType = 'فرد' | 'شركة' | 'وسيط' | 'مسؤول العقار';

export interface Client {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  type: ClientType;
  /** اسم ممثل الشركة — required when `type` is 'شركة', unused otherwise. */
  company_rep_name?: string;
  /** رقم هاتف ممثل الشركة — required when `type` is 'شركة', unused otherwise. */
  company_rep_phone?: string;
  notes?: string;
  status: 'نشط' | 'غير نشط';
  /** الصفة — true when the client owns any property, i.e. is its owner_id (مالك). Read-only. */
  owned_properties_exists?: boolean;
  /** الصفة — true when the client is the tenant on any rental contract (مستأجر). Read-only. */
  rental_contracts_exists?: boolean;
  /** الصفة — true when the client is the buyer on any sale contract (مشتري). Read-only. */
  sale_contracts_exists?: boolean;
  created_at: string;
}

export type RequestType = 'شراء' | 'إيجار';
export type RequestStatus = 'جديد' | 'قيد المتابعة' | 'مكتمل';
export type RequestCategory = 'شقة' | 'أرض' | 'دكان' | 'مستودع' | 'مكتب' | 'محل';

export interface ClientRequest {
  id: string;
  client_id: string;
  client_name: string;
  client_phone: string;
  request_type: RequestType;
  category: RequestCategory;
  /** النشاط — activity names (many-to-many). A request can have several. */
  activities?: string[];
  /** النشاط — the activities joined into one string; read-only, for display. */
  activity?: string;
  /** المحافظة — governorate id (structured location, replaces free-text region/location). */
  governorate_id?: number;
  /** المنطقة — ids of the areas the client would accept, all within the governorate. */
  area_ids?: number[];
  /** اسم المحافظة — governorate name (read-only, from the lookup). */
  governorate?: string;
  /** المنطقة — the area names as an array (read-only, from the lookup). */
  area_names?: string[];
  /** المنطقة — the area names joined into one string; read-only, for display. */
  area_name?: string;
  area?: number;
  /** السعر — the client's budget for this request, in KWD. */
  price?: number;
  /** الوسيط — id of the client (type 'وسيط') acting as broker. */
  broker_id?: string;
  /** الوسيط — broker name; read-only, resolved from the linked client. */
  broker_name?: string;
  /** رقم هاتف الوسيط — read-only, resolved from the linked client. */
  broker_phone_num?: string;
  notes?: string;
  status: RequestStatus;
  created_at: string;
}

export type ContractStatus = 'مسودة' | 'نشط' | 'منتهي' | 'ملغي' | 'مكتمل';
export type PaymentPeriod = 'شهري' | 'ربع سنوي' | 'سنوي' | 'دفعة واحدة';
export type PaymentMethod = 'نقدي' | 'تقسيط بنكي' | 'تقسيط مباشر';

export interface RentalContract {
  id: string;
  contract_number: string;
  property_id: string;
  property_name: string;
  unit_id?: string;
  unit_number?: string;
  owner_name: string;
  tenant_id: string;
  tenant_name: string;
  tenant_phone: string;
  created_at: string;
  start_date: string;
  end_date: string;
  total_amount: number;
  payment_period: PaymentPeriod;
  payment_method: PaymentMethod;
  deposit_amount?: number;
  notes?: string;
  status: ContractStatus;
  documents?: RentalContractDocument[];
}

/** Named document slot attached to a rental contract. */
export type RentalDocumentType =
  | 'civil_id'
  | 'license'
  | 'incorporation_contract'
  | 'signature_authorization'
  | 'commercial_extract';

export interface RentalContractDocument {
  id: string;
  type: RentalDocumentType;
  file_name: string;
  url: string;
}

export interface SaleContract {
  id: string;
  contract_number: string;
  property_id: string;
  property_name: string;
  unit_id?: string;
  unit_number?: string;
  owner_name: string;
  buyer_id: string;
  buyer_name: string;
  buyer_phone: string;
  created_at: string;
  contract_date: string;
  delivery_date?: string;
  total_amount: number;
  payment_method: PaymentMethod;
  down_payment?: number;
  notes?: string;
  status: ContractStatus;
  documents?: SaleContractDocument[];
}

/** Named document slot attached to a sale contract (same set as rental). */
export type SaleDocumentType = RentalDocumentType;

export interface SaleContractDocument {
  id: string;
  type: SaleDocumentType;
  file_name: string;
  url: string;
}

export type CollectionType = 'عمولة' | 'إيجار (دفعة دورية)' | 'عربون' | 'دفعة نقدية' | 'أخرى';
export type CollectionPaymentMethod = 'نقدي' | 'شيك' | 'تحويل بنكي' | 'بطاقة ائتمان';
export type Beneficiary = 'المكتب' | 'المالك' | 'الوسيط';
export type CardType = 'فيزا' | 'ماستركارد' | 'مدى';
/** How the money is collected: recorded as already received, or via a link sent to the client. */
export type CollectionMethod = 'manual' | 'payment_link';
/** Gateways offered on an electronic payment link. */
export type PaymentLinkGateway = 'كي نت' | 'فيزا / ماستركارد' | 'Apple Pay' | 'Google Pay';
/** How the payment link reaches the client. `copy` sends nothing — the office shares it. */
export type PaymentLinkChannel = 'whatsapp' | 'email' | 'copy';
/** Outcome of a payment link, as reported by the gateway callback. */
export type PaymentStatus = 'unpaid' | 'paid' | 'failed';

export interface Collection {
  id: string;
  collection_number: string;
  collection_type: CollectionType;
  client_id: string;
  client_name: string;
  client_phone: string;
  property_id?: string;
  property_name?: string;
  unit_id?: string;
  unit_number?: string;
  broker?: string;
  beneficiary: Beneficiary;
  amount: number;
  /** Defaults to `manual` for records created before payment links existed. */
  collection_method?: CollectionMethod;
  /** Empty while a payment link is still awaiting the client's payment. */
  payment_date: string;
  payment_method: CollectionPaymentMethod;
  /** Payment-link only — how long the link stays valid. */
  payment_link_expiry_days?: number;
  /** Payment-link only — days before expiry to remind the client; `0` = no reminder. */
  payment_link_reminder_days?: number;
  /** Payment-link only — the gateways offered to the client; at least one. */
  payment_link_gateways?: PaymentLinkGateway[];
  /** Payment-link only — the channel the link is delivered on. */
  payment_link_channel?: PaymentLinkChannel;
  /** Payment-link only — the office gateway account (payment_gateways.id) issuing the link. */
  payment_gateway_id?: string;
  /** Read-only label for {@link payment_gateway_id}, from the eager-loaded relation. */
  payment_gateway_name?: string;
  /**
   * Payment-link only — the public URL the client opens to pay through Hesabe.
   * Built by the backend from a secret token; the token itself is never sent here.
   */
  payment_link_url?: string;
  /** Payment-link only — where the link stands: awaiting payment, settled, or declined. */
  payment_status?: PaymentStatus;
  /**
   * Payment-link only — when the link stops working, computed by the backend from
   * {@link payment_link_expiry_days}. Undefined when the office set no expiry.
   */
  payment_link_expires_at?: string;
  check_number?: string;
  check_bank?: string;
  check_date?: string;
  transfer_bank?: string;
  transfer_transaction_number?: string;
  transfer_date?: string;
  card_type?: CardType;
  card_transaction_number?: string;
  card_last4?: string;
  notes?: string;
  attachments: string[];
  has_invoice: boolean;
  invoice_number?: string;
  created_at: string;
}
