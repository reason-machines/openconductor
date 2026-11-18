import { reposFromDb, type DbRepoRow, type DbWorkspaceRow } from "../../src/state/persisted";
import { archivedFromRows } from "../../src/workspace/archivedList";
const date = "2026-11-17T12:00:00Z";
const projects: DbRepoRow[] = [{id:"a",name:"Browser fixture",rootPath:"/fixture",remoteUrl:null,defaultBranch:"main",displayOrder:0,hidden:false,icon:null,createdAt:date}];
const row = (id:string,state:string):DbWorkspaceRow => ({id,repositoryId:"a",state,directoryName:id,workspaceName:id,userSetWorkspaceName:true,branch:"topic/"+id,intendedTargetBranch:"main",placeholderBranchName:null,derivedStatus:null,manualStatus:null,workspacePath:"/fixture/"+id,pinnedAt:null,unread:false,prTitle:null,prDescription:null,number:null,createdAt:date});
const rows = [row("Archived target","archived"),row("Active control","ready"),row("Unstarted control","unstarted")];
export const repos= reposFromDb(projects,rows,[]);
export const archived=archivedFromRows(rows);
