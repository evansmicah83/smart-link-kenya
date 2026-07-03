import { a as objectType, o as stringType, r as enumType } from "../_libs/zod.mjs";
import { m as createFileRoute, p as lazyRouteComponent } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/auth-DjMDBomL.js
var $$splitComponentImporter = () => import("./auth-dV0y1-8R.mjs");
var searchSchema = objectType({
	mode: enumType(["signin", "signup"]).optional(),
	redirect: stringType().optional()
});
var Route = createFileRoute("/auth")({
	ssr: false,
	validateSearch: (s) => searchSchema.parse(s),
	head: () => ({ meta: [
		{ title: "Sign in — SmartLinkNet" },
		{
			name: "description",
			content: "Sign in to manage your ISP, hotspots, and customers on SmartLinkNet."
		},
		{
			name: "robots",
			content: "noindex"
		}
	] }),
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
//#endregion
export { Route as t };
