import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {AllWorkspaces} from "../../src/components/AllWorkspaces";
import {KeybindingsProvider} from "../../src/keybindings/KeybindingsProvider";
import type {Repo} from "../../src/state/types";
import "../../src/fonts.css";
import "../../src/theme/tokens.css";
import "../../src/styles.css";
import "../../src/home.css";
import "../../src/scroll.css";
const repos: Repo[] = ["a", "b"].map(id => ({id:"hydration-"+id, name:"Project "+id.toUpperCase(), path:"/fixture/"+id,defaultBranch:"main",workspaces:[{id:"workspace-"+id,name:"Working "+id.toUpperCase(),userSetWorkspaceName:true,branch:"working-"+id,status:"idle",diff:{added:0,removed:0},createdAt:Date.now()}]}));
function Fixture(){
 const [generation,setGeneration]=useState(0);
 const [pending,setPending]=useState(false);
 const [actions,setActions]=useState<unknown[]>([]);
 return <><aside style={{padding:16,borderBottom:"1px solid var(--border)",fontSize:12,lineHeight:1.8}}><strong>Conductor Rebuild · bounded startup fixture</strong><p>Choose Project B using the real Home menu, then restart and settle. Real filter parser / localStorage save / same-instance [] → repositories recovery. Supplied repositories, not native IPC or package acceptance.</p><button onClick={()=>{setPending(true);setGeneration(g=>g+1);setActions([]);}}>Restart with pending repositories</button>{" "}<button disabled={!pending} onClick={()=>setPending(false)}>Settle repositories</button>{" "}<span role="status" aria-label="Fixture startup state">{pending?"loading":"ready"}</span></aside><AllWorkspaces key={generation} repos={pending?[]:repos} loading={pending} sidebarVisible={true} dispatch={action=>setActions(a=>[...a,action])} onCreateWorkspace={()=>{}}/><pre aria-label="Fixture selection log" style={{padding:16,whiteSpace:"pre-wrap"}}>{JSON.stringify(actions,null,2)}</pre></>;
}
createRoot(document.getElementById("root")!).render(<KeybindingsProvider><Fixture/></KeybindingsProvider>);
