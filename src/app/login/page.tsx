import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  return <LoginForm next={next.startsWith("/") && !next.startsWith("//") ? next : "/"} />;
}
