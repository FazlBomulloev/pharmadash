import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function Layout() {
  return (
    <div className="flex min-h-(--screen-h)">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

export function Page({
  maxWidth, children,
}: {
  maxWidth?: number;
  children: ReactNode;
}) {
  return (
    <main
      className="flex min-w-0 flex-col gap-6 px-[clamp(20px,3vw,40px)] pb-[72px] pt-7"
      style={{ maxWidth }}
    >
      {children}
    </main>
  );
}
