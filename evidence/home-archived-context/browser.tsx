import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {HomeWorkspaceScreen} from "../../src/components/HomeWorkspaceScreen";
import {KeybindingsProvider} from "../../src/keybindings/KeybindingsProvider";
import {repos} from "./data";
import "../../src/fonts.css";
import "../../src/theme/tokens.css";
import "../../src/styles.css";
import "../../src/home.css";
import "../../src/scroll.css";
function BrowserFixture(){
 const [actions,setActions]=useState<unknown[]>([]);
 return <><aside style={{padding:12,borderBottom:"1px solid var(--border)",fontSize:12}}>Conductor Rebuild · bounded browser fixture · real Home/menu components, supplied archive list · no native/provider/persistence acceptance</aside><HomeWorkspaceScreen repos={repos} loading={false} sidebarVisible={true} sections={[]} dispatch={a=>setActions(x=>[...x,a])} onCreateWorkspace={()=>{}} onNewSection={()=>{}} onCopyLink={()=>{}} onError={()=>{}}/><pre aria-label="Fixture action log" style={{padding:12,whiteSpace:"pre-wrap"}}>{JSON.stringify(actions,null,2)}</pre></>;
}
createRoot(document.getElementById("root")!).render(<KeybindingsProvider><BrowserFixture/></KeybindingsProvider>);
