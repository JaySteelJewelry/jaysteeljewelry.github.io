// Netlify Functions v2 adapter: the handler speaks Request/Response already.
// The logic lives in /server/api so it also runs on any other Node host and in node server/dev.mjs.
export { default } from "../../server/api/subscribe.mjs";
export const config = { path: "/api/subscribe" };
