import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({root:process.cwd(),plugins:[{name:"bounded-archive-list",enforce:"pre",resolveId(source,importer){if(source==="../workspace/archive"&&importer?.endsWith("/src/components/AllWorkspaces.tsx"))return path.resolve("evidence/home-archived-context/archive-fixture.ts");}},react()],server:{host:"0.0.0.0",port:4871,strictPort:true}});
