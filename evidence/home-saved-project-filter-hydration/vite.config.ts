import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({root:process.cwd(),plugins:[{name:"bounded-startup-archive-list",enforce:"pre",resolveId(source,importer){if(source==="../workspace/archive"&&importer?.endsWith("/src/components/AllWorkspaces.tsx"))return path.resolve("evidence/home-saved-project-filter-hydration/archive-fixture.ts");}},react()],server:{host:"0.0.0.0",port:4871,strictPort:true,watch:{ignored:["**/.ara-state/**","**/.oc-tmp/**","**/src-tauri/**"]}}});
