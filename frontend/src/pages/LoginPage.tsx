import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authService } from "@/services/auth";
import { settingsService } from "@/services/settings";
import { ApiError } from "@/services/api";

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Office branding (logo + name) loaded from the public settings endpoint.
  const [officeName, setOfficeName] = useState<string | null>(null);
  const [officeLogo, setOfficeLogo] = useState<string | null>(null);

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authService.login(email, password);
      navigate("/dashboard");
    } catch (err) {
      const apiErr = err as ApiError;
      // 422 → field errors under errors.email; 403/other → message
      const msg =
        apiErr.errors?.email?.[0] ??
        apiErr.message ??
        "تعذّر تسجيل الدخول، يرجى المحاولة مجدداً";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#1E3A5F" }}>
      <div className="bg-card rounded-2xl shadow-xl p-10 w-[420px] max-w-[95vw]">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          {officeLogo ? (
            <img
              src={officeLogo}
              alt={officeName ?? "شعار المكتب"}
              className="w-14 h-14 rounded-full object-contain"
            />
          ) : (
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: "#1E40AF" }}>
              <Building2 className="text-white" size={28} />
            </div>
          )}
          <h1 className="text-xl font-bold text-foreground">{officeName ?? "مكتب الدايل"}</h1>
        </div>

        {/* Title */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-foreground mb-1">تسجيل الدخول</h2>
          <p className="text-sm text-muted-foreground">أدخل بياناتك للدخول إلى النظام</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive text-center">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label>البريد الإلكتروني</Label>
            <Input
              type="email"
              placeholder="example@office.com"
              dir="rtl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>كلمة المرور</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                dir="rtl"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full rounded-lg h-11 text-base font-medium"
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : "دخول"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
