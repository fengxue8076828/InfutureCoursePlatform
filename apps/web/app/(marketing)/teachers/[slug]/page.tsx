import {
  ArrowLeft,
  Award,
  BookOpenCheck,
  Briefcase,
  Building2,
  ChevronRight,
  Clock,
  GraduationCap,
  MapPin,
  School,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseCard } from "@/components/CourseCard";
import { getCourses, getTeacher } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const labels = {
  backHome: "\u8fd4\u56de\u9996\u9875",
  professionalTeacher: "\u4e13\u4e1a\u8001\u5e08",
  bioFallback: "\u8fd9\u4f4d\u8001\u5e08\u6b63\u5728\u5b8c\u5584\u4e2a\u4eba\u7b80\u4ecb\u3002",
  coursesTaught: "\u6388\u8bfe\u8bfe\u7a0b",
  studentsTotal: "\u7d2f\u8ba1\u5b66\u751f",
  courseRating: "\u8bfe\u7a0b\u8bc4\u5206",
  noRating: "\u6682\u65e0",
  aboutTeacher: "\u8001\u5e08\u7b80\u4ecb",
  detailFallback: "\u8fd9\u4f4d\u8001\u5e08\u6b63\u5728\u8865\u5145\u6559\u5b66\u7ecf\u5386\u3001\u8bfe\u7a0b\u65b9\u5411\u548c\u8bfe\u5802\u7279\u8272\u3002",
  focus: "\u4e13\u4e1a\u65b9\u5411",
  publicProfile: "\u516c\u5f00\u8d44\u6599",
  institution: "\u6240\u5c5e\u673a\u6784",
  region: "\u6240\u5728\u5730\u533a",
  title: "\u6559\u80b2\u5934\u8854",
  basicInfoFallback: "\u8fd9\u4f4d\u8001\u5e08\u6682\u65f6\u8fd8\u6ca1\u6709\u8865\u5145\u66f4\u591a\u516c\u5f00\u8d44\u6599\u3002",
  teachingProfile: "\u6559\u5b66\u8d44\u5386",
  highestEducation: "\u6700\u9ad8\u5b66\u5386",
  graduationSchool: "\u6bd5\u4e1a\u9662\u6821",
  currentPosition: "\u5f53\u524d\u804c\u4f4d",
  teachingYears: "\u6559\u5b66\u5e74\u9650",
  professionalTitle: "\u804c\u79f0",
  employmentHistory: "\u4efb\u804c\u7ecf\u5386",
  certificates: "\u8d44\u8d28\u4e0e\u8363\u8a89\u8bc1\u4e66",
  noTeacherProfile: "\u8fd9\u4f4d\u8001\u5e08\u6b63\u5728\u5b8c\u5584\u6559\u5b66\u8d44\u5386\u548c\u8bc1\u4e66\u4fe1\u606f\u3002",
  certificateImage: "\u8bc1\u4e66\u56fe\u7247",
  clearGoals: "\u8bfe\u7a0b\u5185\u5bb9\u56f4\u7ed5\u6e05\u6670\u76ee\u6807\u7ec4\u7ec7",
  feedback: "\u7ec3\u4e60\u4e0e\u53cd\u9988\u670d\u52a1\u4e8e\u6301\u7eed\u63d0\u5347",
  teacherCourses: "TA \u7684\u8bfe\u7a0b",
  viewAllCourses: "\u67e5\u770b\u5168\u90e8\u8bfe\u7a0b",
  noCourses: "\u8fd9\u4f4d\u8001\u5e08\u6682\u65f6\u8fd8\u6ca1\u6709\u53d1\u5e03\u8bfe\u7a0b\u3002",
};

type TeacherDetailPageProps = {
  params: Promise<{ slug: string }> | { slug: string };
};

export default async function TeacherDetailPage({ params }: TeacherDetailPageProps) {
  const { slug } = await Promise.resolve(params);
  const [teacher, courses] = await Promise.all([getTeacher(slug), getCourses()]);

  if (!teacher) {
    notFound();
  }

  const teacherCourses = courses.filter((course) => course.teacher.id === teacher.id || course.teacher.slug === teacher.slug);
  const specialtyItems = Array.isArray(teacher.specialties?.items)
    ? teacher.specialties.items.filter(Boolean)
    : [];
  const specialties = specialtyItems.length > 0 ? specialtyItems : [teacher.title].filter(Boolean);
  const avatarUrl = teacher.avatar_url?.trim() || "/avatars/default-teacher.svg";
  const totalStudents = teacherCourses.reduce((sum, course) => sum + (course.students_count || 0), 0);
  const ratingWeight = teacherCourses.reduce((sum, course) => sum + (course.rating_count || 0), 0);
  const weightedRating = ratingWeight
    ? teacherCourses.reduce((sum, course) => sum + (course.rating_average || 0) * (course.rating_count || 0), 0) / ratingWeight
    : 0;

  const stats = [
    { label: labels.coursesTaught, value: `${teacherCourses.length}`, icon: BookOpenCheck },
    { label: labels.studentsTotal, value: `${totalStudents}`, icon: Users },
    { label: labels.courseRating, value: ratingWeight ? weightedRating.toFixed(1) : labels.noRating, icon: Star },
  ];
  const publicInfoItems = [
    { label: labels.region, value: teacher.region, icon: MapPin },
    { label: labels.institution, value: teacher.institution?.name, icon: Building2 },
    { label: labels.title, value: teacher.title, icon: GraduationCap },
  ].filter((item) => item.value?.trim());
  const profile = teacher.teacher_profile;
  const credentialItems = [
    { label: labels.highestEducation, value: profile?.highest_education, icon: GraduationCap },
    { label: labels.graduationSchool, value: profile?.graduation_school, icon: School },
    { label: labels.currentPosition, value: profile?.current_position, icon: Briefcase },
    { label: labels.teachingYears, value: profile?.teaching_years, icon: Clock },
    { label: labels.professionalTitle, value: profile?.professional_title, icon: Award },
  ].filter((item) => item.value?.trim());
  const employmentHistory = profile?.employment_history?.trim() || "";
  const certificates = (profile?.certificates ?? []).filter(
    (certificate) =>
      certificate.name?.trim() ||
      certificate.description?.trim() ||
      certificate.image_url?.trim(),
  );
  const hasTeachingProfile = credentialItems.length > 0 || Boolean(employmentHistory) || certificates.length > 0;

  return (
    <main className="bg-mist">
      <section className="relative overflow-hidden bg-[linear-gradient(135deg,#fff7ed_0%,#eefcf7_48%,#eef4ff_100%)]">
        <div className="absolute left-8 top-10 h-28 w-28 rounded-full bg-coral/10 blur-3xl" />
        <div className="absolute bottom-6 right-10 h-36 w-36 rounded-full bg-mint/20 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:text-coral"
          >
            <ArrowLeft size={16} /> {labels.backHome}
          </Link>

          <div className="mt-8 grid gap-8 lg:grid-cols-[22rem_1fr] lg:items-end">
            <div className="rounded-lg border border-white/80 bg-white/80 p-4 shadow-soft backdrop-blur">
              <img
                src={avatarUrl}
                alt={teacher.name}
                className="aspect-[4/5] w-full rounded-lg object-cover"
              />
            </div>

            <div className="pb-2">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-black text-coral shadow-sm">
                <Sparkles size={16} /> {labels.professionalTeacher}
              </p>
              <h1 className="mt-5 text-4xl font-black leading-tight text-ink sm:text-5xl">
                {teacher.name}
              </h1>
              <p className="mt-3 text-xl font-bold text-slate-700">{teacher.title}</p>
              <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600">
                {teacher.bio || labels.bioFallback}
              </p>

              <div className="mt-6 flex flex-wrap gap-3 text-sm font-bold text-slate-600">
                {teacher.region ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm">
                    <MapPin size={16} className="text-coral" /> {teacher.region}
                  </span>
                ) : null}
                {teacher.institution ? (
                  <Link
                    href={`/institutions/${teacher.institution.slug}`}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm transition hover:text-coral"
                  >
                    <Building2 size={16} className="text-mint" /> {teacher.institution.name}
                    <ChevronRight size={15} />
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="grid gap-4 sm:grid-cols-3">
          {stats.map((item) => (
            <div key={item.label} className="panel rounded-lg p-5">
              <item.icon size={22} className="text-coral" />
              <p className="mt-4 text-3xl font-black text-ink">{item.value}</p>
              <p className="mt-1 text-sm font-bold text-slate-500">{item.label}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_25rem]">
          <div className="panel rounded-lg p-6">
            <p className="text-sm font-black uppercase tracking-wide text-coral">About</p>
            <h2 className="mt-2 text-2xl font-black text-ink">{labels.aboutTeacher}</h2>
            <p className="mt-4 leading-8 text-slate-600">
              {teacher.bio || labels.detailFallback}
            </p>
          </div>

          <div className="panel rounded-lg p-6">
            <p className="text-sm font-black uppercase tracking-wide text-coral">Profile</p>
            <h2 className="mt-2 text-2xl font-black text-ink">{labels.publicProfile}</h2>
            <div className="mt-5 grid gap-3">
              {publicInfoItems.length > 0 ? (
                publicInfoItems.map((item) => (
                  <div key={item.label} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                    <item.icon size={18} className="mt-0.5 text-coral" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">{item.label}</p>
                      <p className="mt-1 text-sm font-bold text-slate-700">{item.value}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">
                  {labels.basicInfoFallback}
                </p>
              )}
            </div>
            <div className="mt-5">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">{labels.focus}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {specialties.map((item) => (
                  <span key={item} className="rounded-full bg-mint/12 px-4 py-2 text-sm font-black text-mint">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 panel rounded-lg p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-coral">Credentials</p>
              <h2 className="mt-2 text-2xl font-black text-ink">{labels.teachingProfile}</h2>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-mint/10 px-4 py-3 text-sm font-bold text-slate-600">
              <GraduationCap size={18} className="text-mint" /> {labels.clearGoals}
            </div>
          </div>

          {hasTeachingProfile ? (
            <div className="mt-6 space-y-6">
              {credentialItems.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {credentialItems.map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                      <item.icon size={20} className="text-coral" />
                      <p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-400">{item.label}</p>
                      <p className="mt-1 text-base font-black text-ink">{item.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {employmentHistory ? (
                <div className="rounded-lg border border-slate-100 bg-white p-5">
                  <p className="flex items-center gap-2 text-sm font-black text-ink">
                    <Briefcase size={18} className="text-coral" /> {labels.employmentHistory}
                  </p>
                  <p className="mt-3 whitespace-pre-line leading-8 text-slate-600">{employmentHistory}</p>
                </div>
              ) : null}

              {certificates.length > 0 ? (
                <div>
                  <p className="flex items-center gap-2 text-sm font-black text-ink">
                    <Award size={18} className="text-coral" /> {labels.certificates}
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {certificates.map((certificate, index) => {
                      const imageUrl = certificate.image_url?.trim();
                      return (
                        <div key={`${certificate.name || labels.certificateImage}-${index}`} className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={certificate.name || labels.certificateImage}
                              className="aspect-[4/3] w-full object-cover"
                            />
                          ) : (
                            <div className="grid aspect-[4/3] place-items-center bg-white">
                              <Award size={34} className="text-slate-300" />
                            </div>
                          )}
                          <div className="p-4">
                            <p className="font-black text-ink">{certificate.name || labels.certificateImage}</p>
                            {certificate.description ? (
                              <p className="mt-2 text-sm leading-6 text-slate-600">{certificate.description}</p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
              {labels.noTeacherProfile}
            </div>
          )}
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-coral">Courses</p>
              <h2 className="mt-2 text-3xl font-black text-ink">{labels.teacherCourses}</h2>
            </div>
            <Link href="/courses" className="inline-flex items-center gap-2 text-sm font-black text-coral hover:text-ink">
              {labels.viewAllCourses} <ChevronRight size={16} />
            </Link>
          </div>

          {teacherCourses.length > 0 ? (
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {teacherCourses.map((course) => (
                <CourseCard key={course.id} course={course} className="w-full" />
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
              {labels.noCourses}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
