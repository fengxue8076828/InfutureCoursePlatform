import { Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-ink text-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.25fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <img src="/logos/logo.png" alt="英启教育 Logo" className="h-12 w-auto rounded-md bg-white px-2 py-1" />
          <p className="mt-4 max-w-sm text-sm leading-7 text-slate-300">
            面向欧洲与全球华人家庭的在线教育平台，连接机构、老师、课程、练习和学习积分体系。
          </p>
          <div className="mt-5 flex gap-2">
            {["课程订阅", "题库练习", "积分成长"].map((item) => (
              <span key={item} className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                {item}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="font-bold text-white">站内链接</p>
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <Link className="hover:text-mint" href="/courses">课程</Link>
            <Link className="hover:text-mint" href="/question-bank">题库</Link>
            <Link className="hover:text-mint" href="/blog">博客</Link>
            <Link className="hover:text-mint" href="/learn">我的课堂</Link>
          </div>
        </div>
        <div>
          <p className="font-bold text-white">机构服务</p>
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <Link className="hover:text-mint" href="/admin/login">机构登录</Link>
            <Link className="hover:text-mint" href="/admin/register">机构注册</Link>
            <span>课程与题库管理</span>
            <span>订阅与学习数据</span>
          </div>
        </div>
        <div>
          <p className="font-bold text-white">联系我们</p>
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <span className="flex items-center gap-2">
              <Phone size={15} className="text-mint" /> +49 30 0000 3939
            </span>
            <span className="flex items-center gap-2">
              <Mail size={15} className="text-mint" /> hello@hualearn.example
            </span>
            <span className="flex items-center gap-2">
              <MapPin size={15} className="text-mint" /> Berlin / Global
            </span>
          </div>
          <div className="mt-5 grid h-24 w-24 place-items-center rounded-lg border border-white/10 bg-white/10 text-xs text-slate-300">
            QR
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-slate-400 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <span>© 2026 Infuture Education. All rights reserved.</span>
          <span>Built for global Chinese learners.</span>
        </div>
      </div>
    </footer>
  );
}
