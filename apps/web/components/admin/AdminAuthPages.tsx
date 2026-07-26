"use client";

import { ArrowRight, Building2, GraduationCap, ImagePlus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

import { institutionCategoryOptions } from "@/lib/admin-data";
import { AdminAuthResponse, persistAdminSession } from "@/lib/admin-session";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export function AdminLoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "admin@example.com",
    password: "password123",
    verificationCode: ""
  });
  const [status, setStatus] = useState("请输入后台账号邮箱和密码，先获取邮箱验证码。");
  const [demoCode, setDemoCode] = useState("");
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === "email" || field === "password") {
      setDemoCode("");
      setStatus("邮箱或密码已修改，请重新获取验证码。");
    }
  }

  async function requestVerificationCode() {
    if (!form.email.trim() || !form.password.trim()) {
      setStatus("请先填写 Email 和密码。");
      return;
    }
    setIsRequestingCode(true);
    setStatus("正在发送验证码...");
    try {
      const response = await fetch(`${API_BASE_URL}/auth/admin-login-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password
        })
      });
      if (!response.ok) {
        setStatus("验证码发送失败，请检查邮箱、密码和账号权限。");
        return;
      }
      const data = (await response.json()) as {
        message: string;
        expires_in_seconds: number;
        demo_code?: string | null;
      };
      setDemoCode(data.demo_code ?? "");
      setStatus(
        data.demo_code
          ? `验证码已发送。本地演示验证码：${data.demo_code}，${Math.floor(data.expires_in_seconds / 60)} 分钟内有效。`
          : data.message
      );
    } catch {
      setStatus("验证码发送失败，请确认 FastAPI 服务正在运行。");
    } finally {
      setIsRequestingCode(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("正在登录...");
    try {
      const response = await fetch(`${API_BASE_URL}/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          verification_code: form.verificationCode
        })
      });
      if (!response.ok) {
        setStatus("登录失败，请检查邮箱、密码和验证码。");
        return;
      }
      const data = (await response.json()) as AdminAuthResponse;
      if (!["super_admin", "institution_admin", "teacher"].includes(data.user.role)) {
        setStatus("该账号不是后台管理员或老师账号，不能进入机构后台。");
        return;
      }
      persistAdminSession(data);
      setStatus("登录成功，正在进入后台...");
      router.push("/admin");
    } catch {
      setStatus("登录失败，请确认 FastAPI 服务正在运行。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-mist">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-4 py-10 lg:grid-cols-[1fr_28rem]">
        <section>
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-coral">
            <GraduationCap size={18} />
            华语云课 HuaLearn Global
          </Link>
          <h1 className="mt-6 text-4xl font-black leading-tight text-ink sm:text-5xl">机构后台登录</h1>
          <p className="mt-4 max-w-xl leading-8 text-slate-600">
            管理员和老师使用机构账号进入后台，维护课程、题库、批改、老师权限和博客内容。
          </p>
          <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
            {["课程维护", "题库编辑", "人工批改"].map((item) => (
              <div key={item} className="panel rounded-lg p-4 text-sm font-bold text-ink">
                <ShieldCheck className="mb-3 text-mint" size={20} />
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="panel rounded-lg p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-ink text-white">
              <Building2 size={20} />
            </span>
            <div>
              <h2 className="text-xl font-bold text-ink">登录后台</h2>
              <p className="text-sm text-slate-500">管理员 / 老师账号</p>
            </div>
          </div>
          <form className="mt-6 grid gap-4" onSubmit={handleLogin}>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Email
              <input
                className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              密码
              <input
                className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                type="password"
                value={form.password}
                onChange={(event) => updateField("password", event.target.value)}
                required
              />
            </label>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={requestVerificationCode}
                disabled={isRequestingCode || isSubmitting}
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-mint/40 bg-white px-4 py-2 text-sm font-bold text-mint disabled:opacity-60"
              >
                {isRequestingCode ? "发送中" : "获取邮箱验证码"}
              </button>
              {demoCode ? (
                <button
                  type="button"
                  onClick={() => updateField("verificationCode", demoCode)}
                  className="focus-ring rounded-lg bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-slate-600"
                >
                  使用本地演示验证码：{demoCode}
                </button>
              ) : null}
            </div>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              邮箱验证码
              <input
                className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                inputMode="numeric"
                value={form.verificationCode}
                onChange={(event) => updateField("verificationCode", event.target.value)}
                placeholder="请输入邮箱收到的验证码"
                required
              />
            </label>
            <button
              type="submit"
              disabled={isSubmitting}
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-coral px-4 py-3 text-sm font-bold text-white"
            >
              {isSubmitting ? "登录中" : "进入后台"}
              <ArrowRight size={17} />
            </button>
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{status}</p>
          </form>
          <div className="mt-5 flex items-center justify-between text-sm">
            <Link href="/admin/register" className="font-bold text-mint">
              注册机构
            </Link>
            <Link href="/" className="text-slate-500">
              返回首页
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

export function InstitutionRegisterPage() {
  const [form, setForm] = useState({
    institutionName: "",
    institutionType: "individual",
    category: "language",
    contactName: "",
    phone: "",
    email: "",
    location: "",
    website: "",
    description: "",
    logoUrl: "",
    serviceAgreementAccepted: false,
    gdprAgreementAccepted: false,
    feeAgreementAccepted: false
  });
  const [status, setStatus] = useState("提交后会创建机构和超级管理员账号，初始密码为 888888。");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateAgreement(
    field: "serviceAgreementAccepted" | "gdprAgreementAccepted" | "feeAgreementAccepted",
    value: boolean
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleLogoFile(file: File | undefined) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setStatus("请上传 PNG、JPG、SVG 等图片格式的机构 logo。");
      return;
    }
    if (file.size > 600 * 1024) {
      setStatus("Logo 图片请控制在 600KB 以内，方便页面快速加载。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      updateField("logoUrl", result);
      setStatus("Logo 已上传，可在下方预览。");
    };
    reader.readAsDataURL(file);
  }

  return (
    <main className="min-h-screen bg-mist py-10">
      <div className="mx-auto max-w-5xl px-4">
        <Link href="/admin/login" className="text-sm font-bold text-coral">
          返回机构登录
        </Link>
        <section className="panel mt-6 rounded-lg p-6">
          <p className="text-sm font-bold text-coral">机构入驻</p>
          <h1 className="mt-2 text-3xl font-black text-ink">注册教育机构账号</h1>
          <form
            className="mt-6 grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!form.serviceAgreementAccepted || !form.gdprAgreementAccepted || !form.feeAgreementAccepted) {
                setStatus("\u8bf7\u5148\u52fe\u9009\u5e73\u53f0\u670d\u52a1\u534f\u8bae\u3001GDPR \u534f\u8bae\u548c\u6536\u8d39\u534f\u8bae\u3002");
                return;
              }
              setIsSubmitting(true);
              setStatus("正在提交注册申请...");
              try {
                const response = await fetch(`${API_BASE_URL}/auth/institution-register`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    institution_name: form.institutionName,
                    institution_type: form.institutionType,
                    category: form.category,
                    contact_name: form.contactName,
                    phone: form.phone,
                    email: form.email,
                    location: form.location,
                    website: form.website || null,
                    logo_url: form.logoUrl || null,
                    description: form.description,
                    service_agreement_accepted: form.serviceAgreementAccepted,
                    gdpr_agreement_accepted: form.gdprAgreementAccepted,
                    fee_agreement_accepted: form.feeAgreementAccepted
                  })
                });
                if (!response.ok) {
                  let detail = "";
                  try {
                    const errorPayload = (await response.json()) as { detail?: unknown };
                    detail = typeof errorPayload.detail === "string" ? errorPayload.detail : "";
                  } catch {
                    detail = "";
                  }
                  if (detail === "Email already registered") {
                    setStatus("提交失败：该 Email 已被注册，请换一个邮箱。");
                    return;
                  }
                  if (detail === "Institution already registered") {
                    setStatus("提交失败：该机构名称已存在。");
                    return;
                  }
                  throw new Error("register failed");
                }
                const data = (await response.json()) as AdminAuthResponse;
                persistAdminSession(data);
                if (form.logoUrl) {
                  window.localStorage.setItem("infuture-admin-logo-url", form.logoUrl);
                }
                window.localStorage.setItem("infuture-admin-institution-name", form.institutionName);
                window.dispatchEvent(new Event("infuture-admin-brand-change"));
                setStatus("机构注册成功，已自动创建超级管理员账号，初始密码为 888888。");
              } catch {
                setStatus("提交失败，请确认 API 已启动且邮箱/机构名称没有重复。");
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
                机构 Logo
                <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-[7rem_1fr]">
                  <div className="grid h-28 w-28 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white text-mint">
                    {form.logoUrl ? (
                      <img src={form.logoUrl} alt="机构 Logo 预览" className="h-full w-full object-contain p-2" />
                    ) : (
                      <ImagePlus size={30} />
                    )}
                  </div>
                  <div className="grid content-center gap-3">
                    <input
                      className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2"
                      type="file"
                      accept="image/*"
                      onChange={(event) => handleLogoFile(event.target.files?.[0])}
                    />
                    <p className="text-xs leading-5 text-slate-500">
                      建议上传透明背景 PNG 或 SVG，文件不超过 600KB。注册成功后会显示在机构后台左上角。
                    </p>
                  </div>
                </div>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                机构名称
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={form.institutionName}
                  onChange={(event) => updateField("institutionName", event.target.value)}
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
                {"\u673a\u6784\u7c7b\u578b"}
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { value: "individual", label: "\u4e2a\u4eba\u673a\u6784", description: "\u9002\u5408\u72ec\u7acb\u8001\u5e08\u548c\u4e2a\u4eba\u6559\u5b66\u54c1\u724c" },
                    { value: "organization", label: "\u7ec4\u7ec7\u673a\u6784", description: "\u9002\u5408\u5b66\u6821\u3001\u57f9\u8bad\u673a\u6784\u548c\u4f01\u4e1a\u4e3b\u4f53" }
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateField("institutionType", option.value)}
                      className={`rounded-lg border p-4 text-left transition ${form.institutionType === option.value ? "border-mint bg-mint/10 text-ink" : "border-slate-200 bg-white text-slate-600"}`}
                    >
                      <span className="text-base font-black">{option.label}</span>
                      <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{option.description}</span>
                    </button>
                  ))}
                </div>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                机构类别
                <select
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={form.category}
                  onChange={(event) => updateField("category", event.target.value)}
                >
                  {institutionCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                联系人
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={form.contactName}
                  onChange={(event) => updateField("contactName", event.target.value)}
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                联系电话
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                机构 Email
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                所在国家/城市
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={form.location}
                  onChange={(event) => updateField("location", event.target.value)}
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                官网
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={form.website}
                  onChange={(event) => updateField("website", event.target.value)}
                />
              </label>
            </div>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              机构简介
              <textarea
                className="focus-ring min-h-32 rounded-lg border border-slate-200 px-3 py-2 leading-7"
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                required
                minLength={10}
              />
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-black text-ink">{"\u5e73\u53f0\u534f\u8bae"}</p>
              <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-700">
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={form.serviceAgreementAccepted} onChange={(event) => updateAgreement("serviceAgreementAccepted", event.target.checked)} />
                  <span>{"\u6211\u5df2\u9605\u8bfb\u5e76\u540c\u610f\u5e73\u53f0\u670d\u52a1\u534f\u8bae"}</span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={form.gdprAgreementAccepted} onChange={(event) => updateAgreement("gdprAgreementAccepted", event.target.checked)} />
                  <span>{"\u6211\u5df2\u9605\u8bfb\u5e76\u540c\u610f GDPR \u6570\u636e\u5904\u7406\u534f\u8bae"}</span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={form.feeAgreementAccepted} onChange={(event) => updateAgreement("feeAgreementAccepted", event.target.checked)} />
                  <span>{"\u6211\u5df2\u9605\u8bfb\u5e76\u540c\u610f\u6536\u8d39\u534f\u8bae\uff1a\u5e73\u53f0\u6309\u8ba2\u9605\u5468\u671f\u62bd\u53d6 15% \u670d\u52a1\u8d39"}</span>
                </label>
              </div>
              {form.institutionType === "organization" ? (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-700">
                  {"\u7ec4\u7ec7\u673a\u6784\u6ce8\u518c\u540e\u9700\u901a\u8fc7 Stripe Connect \u5b8c\u6210\u4f01\u4e1a\u6536\u6b3e\u4e0e\u8eab\u4efd\u8ba4\u8bc1\uff0c\u8ba4\u8bc1\u901a\u8fc7\u540e\u624d\u80fd\u6b63\u5f0f\u53d1\u5e03\u8bfe\u7a0b\u548c\u8d44\u6e90\u3002"}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="focus-ring inline-flex w-fit items-center gap-2 rounded-lg bg-coral px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {isSubmitting ? "提交中" : "提交注册申请"}
                <ArrowRight size={17} />
              </button>
              <Link href="/admin" className="text-sm font-bold text-mint">
                进入后台
              </Link>
            </div>
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{status}</p>
            <p className="rounded-lg bg-mint/10 p-3 text-sm font-semibold text-mint">
              注册成功后，机构超级管理员登录邮箱为上方机构 Email，初始密码为 888888。登录时还需要获取邮箱验证码。
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
