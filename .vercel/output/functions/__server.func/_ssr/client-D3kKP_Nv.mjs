import { t as createClient } from "../_libs/supabase__supabase-js.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/client-D3kKP_Nv.js
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esmMin = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toCommonJS = (mod) => __hasOwnProp.call(mod, "module.exports") ? mod["module.exports"] : __copyProps(__defProp({}, "__esModule", { value: true }), mod);
function createSupabaseClient() {
	const isServer = typeof window === "undefined";
	const SUPABASE_URL = isServer ? process.env.SUPABASE_URL : "https://tghaarhofriakwgvqmpm.supabase.co";
	const SUPABASE_ANON_KEY = isServer ? process.env.SUPABASE_ANON_KEY : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnaGFhcmhvZnJpYWt3Z3ZxbXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODYyODEsImV4cCI6MjA5NzM2MjI4MX0.XThoRtz8kD2TzLqFYIBpCdCkDl5nFOE-ytwWuX7FkdE";
	if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
		const missing = [...!SUPABASE_URL ? ["SUPABASE_URL"] : [], ...!SUPABASE_ANON_KEY ? ["SUPABASE_ANON_KEY"] : []];
		throw new Error(`Missing Supabase environment variable(s): ${missing.join(", ")}`);
	}
	return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: {
		storage: isServer ? void 0 : localStorage,
		persistSession: !isServer,
		autoRefreshToken: !isServer
	} });
}
var _instances, supabase;
var init_client = __esmMin((() => {
	_instances = {};
	supabase = new Proxy({}, { get(_, prop, receiver) {
		const key = typeof window === "undefined" ? "server" : "client";
		if (!_instances[key]) _instances[key] = createSupabaseClient();
		return Reflect.get(_instances[key], prop, receiver);
	} });
}));
//#endregion
export { supabase as a, init_client as i, __exportAll as n, __toCommonJS as r, __esmMin as t };
