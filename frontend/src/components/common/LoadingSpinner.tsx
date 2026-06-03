import clsx from "clsx";

export default function LoadingSpinner({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = { sm: "w-5 h-5", md: "w-8 h-8", lg: "w-12 h-12" };
  return (
    <div className={clsx("flex items-center justify-center", className)}>
      <div
        className={clsx(
          dims[size],
          "border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin",
        )}
      />
    </div>
  );
}
