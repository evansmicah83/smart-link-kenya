import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/mpesa-Daqc4JAO.js
init_client();
async function initiateStkPush(params) {
	const { data, error } = await supabase.functions.invoke("mpesa-stk-push", { body: params });
	if (error) throw error;
	return data;
}
function formatPhone(phone) {
	const cleaned = phone.replace(/\D/g, "");
	if (cleaned.startsWith("0")) return "254" + cleaned.slice(1);
	if (cleaned.startsWith("+")) return cleaned.slice(1);
	if (cleaned.startsWith("254")) return cleaned;
	return "254" + cleaned;
}
//#endregion
export { initiateStkPush as n, formatPhone as t };
