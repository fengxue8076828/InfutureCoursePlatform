"use client";

import { API_BASE_URL } from "@/lib/api-config";

import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import {
  clearStudentSession,
  getStudentRequestHeaders,
  getStudentSessionUser,
  persistStudentSession,
  type StudentAuthResponse
} from "@/lib/student-session";
import type { Course, Enrollment } from "@/lib/types";


const copy = {
  initialStatus: "\u8bf7\u586b\u5199\u5b66\u751f\u4fe1\u606f\uff0c\u786e\u8ba4\u540e\u5c06\u8df3\u8f6c\u5230 Stripe \u5b89\u5168\u652f\u4ed8\u9875\u3002",
  nameRequired: "\u8bf7\u586b\u5199\u5b66\u751f\u59d3\u540d\u3002",
  emailRequired: "\u8bf7\u586b\u5199 Email\u3002",
  creatingCheckout: "\u6b63\u5728\u521b\u5efa\u5b89\u5168\u652f\u4ed8\u8ba2\u5355...",
  redirecting: "\u5373\u5c06\u8df3\u8f6c\u5230 Stripe \u5b89\u5168\u652f\u4ed8\u9875...",
  alreadySubscribed: "\u8ba2\u9605\u5df2\u751f\u6548\uff0c\u6b63\u5728\u8fdb\u5165\u6211\u7684\u5b66\u4e60...",
  apiUnavailable: "\u65e0\u6cd5\u8fde\u63a5 FastAPI \u670d\u52a1\uff0c\u8bf7\u786e\u8ba4\u540e\u7aef\u6b63\u5728\u8fd0\u884c\u3002",
  nonStudentSession: "\u5f53\u524d\u767b\u5f55\u7684\u4e0d\u662f\u5b66\u751f\u8d26\u53f7\uff0c\u8bf7\u9000\u51fa\u540e\u4f7f\u7528\u5b66\u751f\u8d26\u53f7\u8ba2\u9605\u3002",
  nonStudentEmail: "\u8fd9\u4e2a\u90ae\u7bb1\u5c5e\u4e8e\u673a\u6784\u6216\u8001\u5e08\u8d26\u53f7\uff0c\u8bf7\u6362\u4e00\u4e2a\u5b66\u751f\u90ae\u7bb1\u3002",
  courseMissing: "\u8bfe\u7a0b\u4e0d\u5b58\u5728\u6216\u5c1a\u672a\u53d1\u5e03\u3002",
  stripeMissing: "\u652f\u4ed8\u7cfb\u7edf\u8fd8\u6ca1\u6709\u914d\u7f6e Stripe\uff0c\u8bf7\u8054\u7cfb\u5e73\u53f0\u7ba1\u7406\u5458\u3002",
  institutionNotReady: "\u8be5\u8bfe\u7a0b\u6240\u5c5e\u673a\u6784\u8fd8\u6ca1\u6709\u5b8c\u6210\u6536\u6b3e\u8ba4\u8bc1\uff0c\u6682\u65f6\u4e0d\u80fd\u8ba2\u9605\u3002",
  subscribeFailed: "\u8ba2\u9605\u521b\u5efa\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  title: "\u8bfe\u7a0b\u8ba2\u9605",
  studentName: "\u5b66\u751f\u59d3\u540d",
  region: "\u6240\u5728\u56fd\u5bb6 / \u65f6\u533a",
  regionPlaceholder: "\u4f8b\u5982 Germany / CET",
  phone: "\u8054\u7cfb\u7535\u8bdd",
  note: "\u5f53\u524d\u4f7f\u7528 Stripe \u5b89\u5168\u8ba2\u9605\u6d41\u7a0b\uff1a\u786e\u8ba4\u540e\u8df3\u8f6c\u5230\u652f\u4ed8\u9875\uff0c\u652f\u4ed8\u6210\u529f\u540e\u7cfb\u7edf\u4f1a\u81ea\u52a8\u521b\u5efa\u8ba2\u9605\u548c\u8bfe\u7a0b\u62a5\u540d\u8bb0\u5f55\u3002",
  processing: "\u5904\u7406\u4e2d",
  confirmSubscribe: "\u786e\u8ba4\u8ba2\u9605 39 \u6b27\u5143/\u6708",
  summary: "\u8ba2\u9605\u6458\u8981",
  course: "\u8bfe\u7a0b",
  cycle: "\u5468\u671f",
  monthly: "\u6309\u6708",
  monthlyPrice: "39 \u6b27\u5143",
  enterLearn: "\u5df2\u8ba2\u9605\uff1f\u8fdb\u5165\u6211\u7684\u5b66\u4e60"
};

type SubscribeResponse = {
  auth: StudentAuthResponse;
  enrollment: Enrollment | null;
  subscription_status: string;
  checkout_url?: string | null;
  checkout_session_id?: string | null;
};

function subscriptionErrorMessage(message: string) {
  if (message === "Failed to fetch") {
    return copy.apiUnavailable;
  }
  if (message === "Email belongs to a non-student account") {
    return copy.nonStudentEmail;
  }
  if (message === "Please subscribe with a student account") {
    return copy.nonStudentSession;
  }
  if (message === "Course not found") {
    return copy.courseMissing;
  }
  if (message === "Stripe payment is not configured") {
    return copy.stripeMissing;
  }
  if (message === "Institution Stripe onboarding is not complete") {
    return copy.institutionNotReady;
  }
  return message || copy.subscribeFailed;
}

export function CourseSubscribeForm({ course }: { course: Course }) {
  const router = useRouter();
  const [initialStudent] = useState(() => {
    const sessionUser = getStudentSessionUser();
    return sessionUser?.role === "student" ? sessionUser : null;
  });
  const [fullName, setFullName] = useState(initialStudent?.full_name ?? "");
  const [email, setEmail] = useState(initialStudent?.email ?? "");
  const [region, setRegion] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState(copy.initialStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fullName.trim().length < 2) {
      setStatus(copy.nameRequired);
      return;
    }
    if (!email.trim()) {
      setStatus(copy.emailRequired);
      return;
    }

    setIsSubmitting(true);
    setStatus(copy.creatingCheckout);
    try {
      const response = await fetch(`${API_BASE_URL}/learn/courses/${course.slug}/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(initialStudent?.role === "student" ? getStudentRequestHeaders() : {})
        },
        body: JSON.stringify({
          full_name: fullName,
          email,
          region: region || null,
          phone: phone || null
        })
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(typeof detail?.detail === "string" ? detail.detail : "subscribe failed");
      }

      const payload = (await response.json()) as SubscribeResponse;
      persistStudentSession(payload.auth);

      if (payload.checkout_url) {
        setStatus(copy.redirecting);
        window.location.assign(payload.checkout_url);
        return;
      }

      if (payload.enrollment) {
        setStatus(copy.alreadySubscribed);
        router.push("/learn");
        router.refresh();
        return;
      }

      setStatus(copy.subscribeFailed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "Please subscribe with a student account") {
        clearStudentSession();
      }
      setStatus(subscriptionErrorMessage(message));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_22rem] lg:px-8">
      <section className="panel rounded-lg p-6">
        <p className="text-sm font-bold text-coral">{copy.title}</p>
        <h1 className="mt-2 text-3xl font-black text-ink">{course.title}</h1>
        <p className="mt-3 leading-7 text-slate-600">{course.subtitle}</p>

        <form onSubmit={submitSubscription} className="mt-6 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              {copy.studentName}
              <input
                className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Email
              <input
                className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              {copy.region}
              <input
                className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                placeholder={copy.regionPlaceholder}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              {copy.phone}
              <input
                className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+36 ..."
              />
            </label>
          </div>

          <div className="rounded-lg border border-dashed border-mint/50 bg-mint/10 p-4 text-sm leading-6 text-slate-600">
            {copy.note}
          </div>

          <button
            disabled={isSubmitting}
            className="focus-ring mt-2 inline-flex w-fit items-center gap-2 rounded-lg bg-coral px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#f25f54] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
            {isSubmitting ? copy.processing : copy.confirmSubscribe}
          </button>
        </form>

        <p className="mt-5 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-500">{status}</p>
      </section>

      <aside className="panel h-fit rounded-lg p-5">
        <div className="flex items-center gap-2 font-bold text-ink">
          <ShieldCheck size={18} />
          {copy.summary}
        </div>
        <div className="mt-5 grid gap-3 text-sm text-slate-600">
          <div className="flex justify-between gap-4">
            <span>{copy.course}</span>
            <span className="text-right font-semibold text-ink">{course.title}</span>
          </div>
          <div className="flex justify-between">
            <span>{copy.cycle}</span>
            <span className="font-semibold text-ink">{copy.monthly}</span>
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-3">
            <span>{copy.monthlyPrice}</span>
            <span className="font-black text-ink">{copy.monthlyPrice}</span>
          </div>
        </div>
        <Link href="/learn" className="mt-5 block text-sm font-bold text-coral">
          {copy.enterLearn}
        </Link>
      </aside>
    </div>
  );
}
