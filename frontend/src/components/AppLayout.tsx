import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { authService } from "@/services/auth";
import { settingsService } from "@/services/settings";
import ProfileDialog from "@/components/ProfileDialog";
import { LookupsProvider } from "@/contexts/LookupsContext";
import { NotificationsProvider, useNotifications } from "@/contexts/NotificationsContext";
import {
  LayoutDashboard,
  Building2,
  Construction,
  Users,
  ClipboardList,
  FileText,
  Banknote,
  BarChart3,
  Settings,
  SlidersHorizontal,
  Bell,
  LogOut,
  BookOpen,
  UserCog,
  Menu,
  X,
} from "lucide-react";

const navItems = [
  { label: "لوحة التحكم", path: "/dashboard", icon: LayoutDashboard },
  { label: "عقارات الإيجار", path: "/properties/rent", icon: Building2 },
  { label: "عقارات البيع", path: "/properties/sale", icon: Construction },
  { label: "العملاء", path: "/clients", icon: Users },
  { label: "طلبات الإيجار", path: "/requests/rent", icon: ClipboardList },
  { label: "طلبات الشراء", path: "/requests/sale", icon: ClipboardList },
  { label: "عقود الإيجار", path: "/contracts/rent", icon: FileText },
  { label: "عقود البيع", path: "/contracts/sale", icon: FileText },
  { label: "التحصيل المالي", path: "/collections", icon: Banknote },
  { label: "التقارير", path: "/reports", icon: BarChart3 },
  { label: "المستخدمون", path: "/users", icon: UserCog, adminOnly: true },
  { label: "الإعدادات", path: "/settings", icon: Settings },
  // The feed of alerts the system has mailed out; `badge` gives it the unread
  // count. Its settings are the screen below — the two used to share this path.
  // `end` because the settings row below nests under this path — without it a
  // NavLink prefix-matches and both rows highlight at once.
  { label: "التنبيهات", path: "/notifications", icon: Bell, badge: true, end: true },
  { label: "إعدادات التنبيهات", path: "/notifications/settings", icon: SlidersHorizontal },
  { label: "دليل المستخدم", path: "/guide", icon: BookOpen },
];

const SidebarContent = ({
  onNavClick,
  onLogout,
  loggingOut,
  officeName,
  officeLogo,
  isAdmin,
}: {
  onNavClick?: () => void;
  onLogout: () => void;
  loggingOut: boolean;
  officeName: string | null;
  officeLogo: string | null;
  isAdmin: boolean;
}) => {
  const { unread } = useNotifications();

  return (
  <div className="flex flex-col h-full">
    {/* Logo */}
    <div className="flex items-center justify-between px-4 py-5 border-b border-white/10">
      <div className="flex items-center gap-3">
        {officeLogo ? (
          <img src={officeLogo} alt={officeName ?? "شعار المكتب"} className="h-6 w-6 rounded object-contain" />
        ) : (
          <Building2 className="text-white" size={24} />
        )}
        <span className="text-white font-bold text-lg">{officeName ?? "مكتب العقارات"}</span>
      </div>
      {onNavClick && (
        <button className="text-white lg:hidden" onClick={onNavClick}>
          <X size={20} />
        </button>
      )}
    </div>

    {/* Nav items */}
    <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
      {navItems.filter((item) => !item.adminOnly || isAdmin).map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.end}
          onClick={onNavClick}
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full ${
              isActive
                ? "bg-white text-primary"
                : "text-white hover:bg-white/10"
            }`
          }
        >
          <item.icon size={20} className="shrink-0" />
          <span>{item.label}</span>
          {/* ms-auto, not mr-auto: the count sits at the row's end, which is its
              left under RTL and would be the wrong side if hard-coded. dir="ltr"
              keeps the overflow marker reading "99+" — a neutral "+" takes the
              paragraph direction and would otherwise render leading. */}
          {item.badge && unread > 0 && (
            <span
              dir="ltr"
              className="ms-auto shrink-0 rounded-full bg-red-500 text-white text-[11px] font-bold leading-none px-2 py-1"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </NavLink>
      ))}
    </nav>

    {/* Logout */}
    <div className="p-4 border-t border-white/10">
      <button
        onClick={() => { onNavClick?.(); onLogout(); }}
        disabled={loggingOut}
        className="flex items-center gap-2 text-white text-sm hover:text-red-300 transition-colors w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <LogOut size={16} />
        <span>{loggingOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}</span>
      </button>
    </div>
  </div>
  );
};

const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [officeName, setOfficeName] = useState<string | null>(null);
  const [officeLogo, setOfficeLogo] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [user, setUser] = useState(authService.getUser());
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  // Load office branding (logo + name) for the sidebar and header.
  useEffect(() => {
    settingsService
      .branding()
      .then((b) => {
        setOfficeName(b.office_name);
        setOfficeLogo(b.office_logo);
      })
      .catch(() => {
        // Branding is optional — fall back to the default icon/title.
      });
  }, []);

  // Route guard — block protected pages without a token
  if (!authService.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    if (loggingOut) return; // guard against double-clicks
    setLoggingOut(true);
    try {
      await authService.logout(); // POST /auth/logout — revokes the token server-side
      navigate("/login", { replace: true });
    } catch {
      toast.error("تعذّر تسجيل الخروج، حاول مجدداً");
      setLoggingOut(false);
    }
  };

  const initials = user?.name?.trim().slice(0, 2) || "؟";

  return (
    <LookupsProvider>
    {/* Inside the auth guard above, so the unread poll never runs without a token. */}
    <NotificationsProvider>
    <div className="flex h-screen overflow-hidden" dir="rtl">
      {/* Desktop Sidebar — always visible on lg+ */}
      <aside
        className="hidden lg:flex flex-col w-64 shrink-0"
        style={{ backgroundColor: "#1E3A5F" }}
      >
        <SidebarContent onLogout={handleLogout} loggingOut={loggingOut} officeName={officeName} officeLogo={officeLogo} isAdmin={isAdmin} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={`
          fixed top-0 right-0 z-50 h-full w-64 flex flex-col
          transform transition-transform duration-300 ease-in-out
          lg:hidden
          ${sidebarOpen ? "translate-x-0" : "translate-x-full"}
        `}
        style={{ backgroundColor: "#1E3A5F" }}
      >
        <SidebarContent onNavClick={() => setSidebarOpen(false)} onLogout={handleLogout} loggingOut={loggingOut} officeName={officeName} officeLogo={officeLogo} isAdmin={isAdmin} />
      </aside>

      {/* Main Content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-card border-b flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-2">
            {/* Hamburger — mobile only */}
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-muted text-muted-foreground"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <h1 className="text-base md:text-lg font-bold text-foreground">{officeName ?? "مكتب العقارات"}</h1>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              title="الملف الشخصي"
              className="flex items-center gap-2 md:gap-3 rounded-lg px-1 py-1 hover:bg-muted transition-colors"
            >
              <span className="text-sm text-muted-foreground hidden sm:inline">{user?.name ?? ""}</span>
              <Avatar className="h-8 w-8 md:h-9 md:w-9">
                <AvatarFallback className="text-xs font-bold" style={{ backgroundColor: "#1E40AF", color: "white" }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              disabled={loggingOut}
              className="text-muted-foreground hover:text-destructive"
            >
              <LogOut size={18} />
            </Button>
          </div>
        </header>

        {/* Content */}
        <main
          className="flex-1 overflow-y-auto p-3 md:p-6"
          style={{ backgroundColor: "#F8FAFC" }}
        >
          <Outlet />
        </main>
      </div>

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={user}
        onSaved={setUser}
      />
    </div>
    </NotificationsProvider>
    </LookupsProvider>
  );
};

export default AppLayout;
