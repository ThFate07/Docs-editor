import { isAuthenticated } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";
import Dashboard from "@/components/Dashboard";

export default async function Home() {
  const authed = await isAuthenticated();
  return authed ? <Dashboard /> : <LoginForm />;
}
