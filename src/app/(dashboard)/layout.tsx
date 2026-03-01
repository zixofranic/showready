"use client";

import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/events", label: "Events" },
  { href: "/properties", label: "Properties" },
  { href: "/settings/integrations", label: "Integrations" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, signOut, loading } = useAuth();
  const pathname = usePathname();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-bold text-slate-900">
              ShowReady
            </Link>
            <nav className="hidden sm:flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <>
                <span className="text-xs text-slate-500 hidden sm:block">
                  {user.email}
                </span>
                <button
                  onClick={signOut}
                  className="text-xs text-slate-500 hover:text-red-600 transition-colors"
                >
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
