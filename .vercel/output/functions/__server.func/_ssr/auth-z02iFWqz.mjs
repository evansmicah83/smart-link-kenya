import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { n as useQuery } from "../_libs/tanstack__react-query.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/auth-z02iFWqz.js
var import_react = /* @__PURE__ */ __toESM(require_react());
init_client();
function useAuth() {
	const [session, setSession] = (0, import_react.useState)(null);
	const [user, setUser] = (0, import_react.useState)(null);
	const [loading, setLoading] = (0, import_react.useState)(true);
	(0, import_react.useEffect)(() => {
		const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
			setSession(s);
			setUser(s?.user ?? null);
		});
		supabase.auth.getSession().then(({ data }) => {
			setSession(data.session);
			setUser(data.session?.user ?? null);
			setLoading(false);
		});
		return () => sub.subscription.unsubscribe();
	}, []);
	return {
		session,
		user,
		loading
	};
}
async function fetchProfile(userId) {
	const { data, error } = await supabase.from("profiles").select("id, tenant_id, full_name, email, phone, avatar_url").eq("id", userId).maybeSingle();
	if (error) {
		console.error(error);
		return null;
	}
	return data;
}
async function fetchMyRoles(userId) {
	const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
	if (error) {
		console.error(error);
		return [];
	}
	return (data ?? []).map((r) => r.role);
}
async function signOut() {
	await supabase.auth.signOut();
}
function useTenantId() {
	const { user } = useAuth();
	return useQuery({
		queryKey: ["tenant-id", user?.id],
		queryFn: async () => {
			const { data } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
			return data?.tenant_id ?? null;
		},
		enabled: !!user,
		staleTime: 300 * 1e3
	});
}
//#endregion
export { useTenantId as a, useAuth as i, fetchProfile as n, signOut as r, fetchMyRoles as t };
