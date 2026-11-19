"use client";

// ============ فروشگاه آنلاین (R15-C) — دیالوگ ورود/ثبت‌نام مشتری ============
// حساب مشتری با ایمیل (بدون پیامک) — جدول سبک StorefrontCustomer.

import * as React from "react";
import { Loader2, LogIn, UserPlus, Mail, Lock, User, Phone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export interface SfCustomerSession {
  id: string;
  name: string;
  email: string;
}

interface CustomerAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  onLoggedIn: (customer: SfCustomerSession) => void;
  /** پیش‌پر شدن از مرحله پرداخت */
  prefill?: { name?: string; email?: string; phone?: string };
}

export function CustomerAuthDialog({
  open,
  onOpenChange,
  slug,
  onLoggedIn,
  prefill,
}: CustomerAuthDialogProps) {
  const { toast } = useToast();
  const [tab, setTab] = React.useState<string>("login");
  const [busy, setBusy] = React.useState(false);

  // ورود
  const [loginEmail, setLoginEmail] = React.useState("");
  const [loginPassword, setLoginPassword] = React.useState("");
  // ثبت‌نام
  const [regName, setRegName] = React.useState("");
  const [regEmail, setRegEmail] = React.useState("");
  const [regPhone, setRegPhone] = React.useState("");
  const [regPassword, setRegPassword] = React.useState("");

  React.useEffect(() => {
    if (open && prefill) {
      setLoginEmail(prefill.email ?? "");
      setRegName(prefill.name ?? "");
      setRegEmail(prefill.email ?? "");
      setRegPhone(prefill.phone ?? "");
    }
  }, [open, prefill]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/storefront/${encodeURIComponent(slug)}/customer/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ورود ناموفق", description: json?.error || "ایمیل یا رمز عبور اشتباه است", variant: "destructive" });
        return;
      }
      toast({ title: "خوش آمدید", description: `سلام ${json.customer.name}` });
      onLoggedIn(json.customer as SfCustomerSession);
      onOpenChange(false);
    } catch {
      toast({ title: "خطای شبکه", description: "اتصال اینترنت را بررسی کنید", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/storefront/${encodeURIComponent(slug)}/customer/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          phone: regPhone || undefined,
          password: regPassword,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ثبت‌نام ناموفق", description: json?.error || "اطلاعات را بررسی کنید", variant: "destructive" });
        return;
      }
      toast({ title: "ثبت‌نام انجام شد", description: `سلام ${json.customer.name} — از این پس سفارش‌های شما قابل پیگیری است` });
      onLoggedIn(json.customer as SfCustomerSession);
      onOpenChange(false);
    } catch {
      toast({ title: "خطای شبکه", description: "اتصال اینترنت را بررسی کنید", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "text-right";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>حساب مشتری</DialogTitle>
          <DialogDescription>
            با ایمیل و رمز عبور وارد شوید تا سفارش‌ها و وضعیت آن‌ها را پیگیری کنید.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} dir="rtl">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login" className="gap-1.5">
              <LogIn className="h-4 w-4" aria-hidden="true" />
              ورود
            </TabsTrigger>
            <TabsTrigger value="register" className="gap-1.5">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              ثبت‌نام
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="mt-4">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sf-login-email">ایمیل</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="sf-login-email"
                    type="email"
                    inputMode="email"
                    dir="ltr"
                    className={`${inputCls} pl-9`}
                    placeholder="you@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sf-login-password">رمز عبور</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="sf-login-password"
                    type="password"
                    dir="ltr"
                    className={`${inputCls} pl-9`}
                    placeholder="********"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
                ورود به حساب
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register" className="mt-4">
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sf-reg-name">نام و نام خانوادگی</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="sf-reg-name"
                    className={`${inputCls} pl-9`}
                    placeholder="مثلاً: مریم احمدی"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sf-reg-email">ایمیل</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="sf-reg-email"
                    type="email"
                    inputMode="email"
                    dir="ltr"
                    className={`${inputCls} pl-9`}
                    placeholder="you@example.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sf-reg-phone">شماره تماس (اختیاری)</Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="sf-reg-phone"
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    className={`${inputCls} pl-9`}
                    placeholder="09123456789"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    autoComplete="tel"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sf-reg-password">رمز عبور (حداقل ۶ نویسه)</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="sf-reg-password"
                    type="password"
                    dir="ltr"
                    className={`${inputCls} pl-9`}
                    placeholder="********"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
                ساخت حساب مشتری
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
