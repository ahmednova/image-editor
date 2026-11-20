import { Link } from "@tanstack/react-router";

/** Admins switch between their own documents and everyone's. */
export function LibraryNav({ admin, current }: { admin: boolean; current: "mine" | "all" }) {
  if (!admin) return null;
  const linkClass = (active: boolean) =>
    active ? "text-sm text-foreground" : "text-sm text-muted-foreground transition-colors hover:text-foreground";
  return (
    <nav className="flex items-center gap-4">
      <Link to="/" className={linkClass(current === "mine")}>My documents</Link>
      <Link to="/admin" className={linkClass(current === "all")}>All documents</Link>
    </nav>
  );
}
