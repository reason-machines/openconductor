import json
S=[]
def st(id, title, ref=None, oc=None, oc_reason=None, covers=None, **kw):
    d=dict(id=id, title=title)
    if ref is not None: d['ref']=ref
    if oc is not None: d['oc']=oc
    if oc_reason: d['oc_reason']=oc_reason
    if covers: d['covers']=covers
    d.update(kw); S.append(d)
W={"wait":"text=tide-web"}
def ref(path="/", scenario="populated", actions=(), wait=True, **kw):
    a=([W] if wait and scenario=="populated" else [])+list(actions)
    return dict(path=path, scenario=scenario, actions=a, **kw)
SETTINGS=[{"click":".sb-footer-btn","text":"Settings"},{"wait":".settings","after_ms":800}]
def oc_settings(label=None, extra=()):
    s=list(SETTINGS)
    if label: s.append({"click":".settings-nav .nav-item","text":label})
    return s+list(extra)
OPEN_WS=[{"click":".sb-ws-name","after_ms":1500}]
HOME=[{"click":".sb-primary .sb-row","text":"Home","after_ms":800}]
# Chat turns from tools/reason-acp/fake_reason_acp.py, which the lane puts on PATH as `reason` for
# states with oc_fake_reason. The prompts are its aliases for Conductor's reference turns.
LISBON_PROMPT="After signing in, users with an expired session get bounced between /login and /dashboard forever. Can you find out why and fix it?"
TALLINN_PROMPT="Return X-RateLimit-Limit and X-RateLimit-Remaining headers on every API response."
def send_prompt(text):
    # React's native value setter plus an input event: WebDriver typing loses keys when the
    # workspace terminal takes focus (#402).
    return [{"wait":".composer textarea"},
            {"exec":"const ta=document.querySelector('.composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(ta,arguments[0]);ta.dispatchEvent(new Event('input',{bubbles:true}));","args":[text],"after_ms":300},
            {"click":".composer button[type=submit]","after_ms":500}]

# screens and routes
st("onboarding-signed-out","Onboarding, signed out", ref("/", "signed-out"), oc=[], oc_fresh=True, covers=[{"kind":"route","name":"/login"}])
st("first-run-onboarding","First-run onboarding", ref("/first-run-onboarding","signed-in"), oc=[], oc_fresh=True, covers=[{"kind":"route","name":"/first-run-onboarding"}])
st("home-empty","Home, no projects", ref("/","signed-in"), oc=[{"click":".onb-continue","after_ms":1000}], oc_fresh=True)
st("home","Home with projects", ref("/"), oc=HOME, covers=[{"kind":"route","name":"/"}])
st("all-workspaces","All workspaces list", ref("/all-workspaces"), oc=HOME, covers=[{"kind":"route","name":"/all-workspaces"}])
st("create","Create workspace composer", ref(actions=[{"click":"text=Create >> nth=0"}]), oc=[{"click":".sb-primary .sb-row","text":"Create","after_ms":800}], covers=[{"kind":"route","name":"/create"}])
st("create-repo-picker","Create: repo picker open", ref(actions=[{"click":"text=Create >> nth=0"},{"click":"text=Select repo"}]), oc=[{"click":".sb-primary .sb-row","text":"Create","after_ms":800},{"click":".create-repo-trigger"}])
st("workspace-chat","Workspace: chat transcript", ref(actions=[{"click":"text=tide-web"},{"click":"text=Ada/fix login redirect"}]), oc=OPEN_WS, covers=[{"kind":"route","name":"/repository/$repositoryId/workspace/$localWorkspaceId"}])
st("workspace-new-chat","Workspace: new empty chat", ref(actions=[{"click":"text=tide-web"},{"click":"text=Ada/dark mode tokens"}]), oc=OPEN_WS)
st("workspace-tool-calls","Chat: tool calls expanded", ref(actions=[{"click":"text=tide-web"},{"click":"text=Ada/fix login redirect"},{"click":"text=4 tool calls, 2 messages"}]),
   oc=OPEN_WS+send_prompt(LISBON_PROMPT)+[{"wait":".chat-tool-summary-row","timeout":30000,"after_ms":800},{"click":".chat-tool-summary-row","after_ms":800}], oc_fake_reason=True)
st("diff-unified","Diff: file, unified", ref(actions=[{"click":"text=tide-web"},{"click":"text=Ada/fix login redirect"},{"click":"text=auth.ts >> nth=-1"}]), oc=OPEN_WS+[{"click":"button.oc-change[title='Open src/lib/auth.ts']","after_ms":1500}])
st("diff-split","Diff: file, split", ref(actions=[{"click":"text=tide-web"},{"click":"text=Ada/fix login redirect"},{"click":"text=auth.ts >> nth=-1"},{"click":"role=button[name='Split view']"}]), oc=OPEN_WS+[{"click":"button.oc-change[title='Open src/lib/auth.ts']","after_ms":1500},{"click":"button","text":"Split view"}])
st("diff-entire-file","Diff: entire file", ref(actions=[{"click":"text=tide-web"},{"click":"text=Ada/fix login redirect"},{"click":"text=auth.ts >> nth=-1"},{"click":"role=button[name='Entire file']"}]), oc=OPEN_WS+[{"click":"button.oc-change[title='Open src/lib/auth.ts']","after_ms":1500},{"click":"button","text":"Entire file"}])
# Conductor's harness sends the sidecar's toolApproval request for "tallinn" (scenario needs-permission,
# tools/screens/seed-data.js); OpenConductor gets the same turn from the fake `reason acp` ("tallinn").
st("needs-permission","Workspace needing permission", ref(scenario="needs-permission", actions=[{"click":"text=tide-api"},{"click":"text=Ada/rate limit headers"},{"wait":"text=Do you want to run this command?"}]),
   oc=OPEN_WS+send_prompt(TALLINN_PROMPT)+[{"wait":"[data-testid=chat-permission-request]","timeout":30000,"after_ms":800}], oc_fake_reason=True)
for path,title in [("/dashboard","Dashboard"),("/routines","Routines"),("/routines/new","New routine"),("/team","Team"),("/diagnostics","Diagnostics"),("/new-member-onboarding","New member onboarding"),("/cloud-collab-onboarding","Cloud collaboration onboarding")]:
    sid="route-"+path.strip("/").replace("/","-")
    if path == "/diagnostics":
        # Help > Diagnostics opens it (Conductor's footer help popover navigates to /diagnostics).
        st(sid, title, ref(path, wait=False), oc=[{"click":".sb-footer-btn","text":"Help"},{"click":"[role=menu] [role=menuitem]","text":"Diagnostics","after_ms":800}], covers=[{"kind":"route","name":path}])
        continue
    # OpenConductor's /routines pages run on Reason Loops and need a signed-in Reason account, which the lane's
    # throwaway HOME has none of; tools/side-by-side/routines.mjs scores them with the Reason API mocked.
    reason = ("the UI map lane has no Reason account; scored by tools/side-by-side/routines.mjs" if path.startswith("/routines")
              else "OpenConductor has no route or view for "+path)
    st(sid, title, ref(path, wait=path not in ("/diagnostics","/new-member-onboarding","/cloud-collab-onboarding")), oc_reason=reason, covers=[{"kind":"route","name":path}])
st("login","Login", ref("/login","signed-out"), oc=[], oc_fresh=True, covers=[{"kind":"route","name":"/login"}])

# settings
USER=[("general","General"),("account","Account"),("models","Default models"),("providers","Agents"),("environment","Environment"),("git","Git"),("ports",None),("appearance","Appearance"),("key-bindings","Keyboard shortcuts"),("experimental","Experimental"),("advanced","Advanced"),("terminal","Big terminal"),("internal",None)]
for tab,label in USER:
    path="/settings/user/"+tab
    if tab=="terminal":
        # Conductor lists the Big terminal tab (under More) only while Big terminal mode is on, and
        # /settings/user/terminal renders General when it is off, so both sides turn the mode on first.
        st("settings-terminal", "Settings > Big terminal",
           ref("/settings/user/experimental", actions=[{"click":"#big-terminal-mode"},{"click":"text=\"Big terminal\""}]),
           oc=oc_settings("Experimental", [{"click":"input[role=switch]","text":"Big terminal mode","after_ms":400},{"click":".settings-nav .nav-item","text":"Big terminal","after_ms":600}]),
           covers=[{"kind":"route","name":path},{"kind":"settings-page","name":tab}])
    elif label:
        st("settings-"+tab, "Settings > "+(label), ref(path), oc=oc_settings(label), covers=[{"kind":"route","name":path},{"kind":"settings-page","name":tab}])
    else:
        st("settings-"+tab, "Settings > "+tab, ref(path), oc_reason="OpenConductor's settings have no %s page" % tab, covers=[{"kind":"route","name":path},{"kind":"settings-page","name":tab}])
for sec,label in [("environment","Environment"),("git","Git"),("scripts","Scripts"),("actions","Actions"),("misc","Misc")]:
    path="/settings/repos/repo-tide-web/"+sec
    # Misc shows the repository path too, so "text=tide-web" matches twice there and REA's wait fails.
    r = ref(path, wait=False, actions=[{"wait":"text=Repository paths and workspace file behavior."}]) if sec=="misc" else ref(path)
    st("settings-repo-"+sec, "Settings > tide-web > "+label, r, oc=oc_settings(None,[{"click":".settings-repo","text":"Ttide-web"},{"click":".settings-repo-sections .nav-item","text":label}]), covers=[{"kind":"route","name":"/settings/repos/$repoId/"+sec},{"kind":"settings-page","name":"repo-"+sec}])
# Misc is taller than the window: a second state scrolls to its last rows (Files to copy preview, Remove repository).
# REA's scenario has no hover or scroll action, so the reference clicks the preview's note, which scrolls it to the middle.
st("settings-repo-misc-lower", "Settings > tide-web > Misc, scrolled to Remove repository",
   ref("/settings/repos/repo-tide-web/misc", wait=False, actions=[{"wait":"text=Repository paths and workspace file behavior."},{"click":"text=No matching gitignored files found."}]),
   oc=oc_settings(None,[{"click":".settings-repo","text":"Ttide-web"},{"click":".settings-repo-sections .nav-item","text":"Misc","after_ms":800},{"exec":"document.querySelector('.settings-misc-files-note')?.scrollIntoView({block:'center'})","after_ms":400}]),
   covers=[{"kind":"settings-page","name":"repo-misc"}])
for sec in ["github","members","preferences","computer","environment","mcp","prompts"]:
    path="/settings/organization/"+sec
    st("settings-org-"+sec, "Settings > Organization > "+sec, ref(path), oc_reason="OpenConductor has no organization settings", covers=[{"kind":"route","name":path},{"kind":"settings-page","name":"organization-"+sec}])
st("settings-cloud-setup","Settings > Cloud setup", ref("/settings/cloud/setup"), oc_reason="OpenConductor has no cloud settings", covers=[{"kind":"route","name":"/settings/cloud/setup"}])
st("settings-search","Settings search", ref("/settings/user/general", actions=[{"fill":["input[placeholder='Search settings']","branch"]}]), oc=oc_settings(None,[{"type":"branch","css":".settings input[type=search], .settings input[placeholder]"}]))

# palette
st("palette-all","Command palette", ref(actions=[{"press":"Meta+k"}]), oc=[{"chord":["Meta"],"key":"k","after_ms":800}])
st("palette-workspaces","Command palette: Workspaces tab", ref(actions=[{"press":"Meta+k"},{"click":"[role=dialog] >> text=Workspaces"}]), oc=[{"chord":["Meta"],"key":"k","after_ms":800},{"click":"[role=dialog] button, [role=dialog] [role=tab]","text":"Workspaces"}])
st("palette-search","Command palette: search", ref(actions=[{"press":"Meta+k"},{"fill":["[role=dialog] input","login"]}]), oc=[{"chord":["Meta"],"key":"k","after_ms":800},{"keys":"login"}])

# dialogs
st("dialog-clone-github","Clone GitHub repo dialog", ref(actions=[{"click":"text=Open GitHub project"}]), oc=[{"click":".home-card","text":"Open GitHub project","after_ms":800}])
st("dialog-create-project","Create project dialog", ref(actions=[{"click":"text=Quick start"}]), oc=[{"click":".home-card","text":"Quick start","after_ms":800}])
st("dialog-rename-workspace","Rename workspace dialog", ref(actions=[{"click":"text=tide-web"},{"rclick":"text=Ada/fix login redirect"},{"click":"[role=menu] >> text=Rename"}]), oc=[{"rclick":".sb-ws-name"},{"click":"[role=menu] [role=menuitem]","text":"Rename"}])
st("dialog-keyboard-shortcuts","Keyboard shortcuts dialog", ref(actions=[{"press":"Meta+/"}]), oc=[{"chord":["Meta"],"key":"/","after_ms":800}])

# menus and toasts
st("menu-account","Account / computer menu", ref(actions=[{"click":"[aria-label='Account menu']"}]), oc=[{"click":".sb-computer"}])
st("menu-workspace-context","Workspace context menu", ref(actions=[{"click":"text=tide-web"},{"rclick":"text=Ada/fix login redirect"}]), oc=[{"rclick":".sb-ws-name"}])
st("menu-workspace-status","Workspace context menu > Set status", ref(actions=[{"click":"text=tide-web"},{"rclick":"text=Ada/fix login redirect"},{"click":"[role=menu] >> text=Set status"}]), oc=[{"rclick":".sb-ws-name"},{"click":"[role=menu] [role=menuitem]","text":"Set status"}])
st("menu-model-picker","Composer model picker", ref(actions=[{"click":"text=tide-web"},{"click":"text=Ada/fix login redirect"},{"click":"text=Opus 5 >> nth=-1"}]), oc=OPEN_WS+[{"click":".composer .oc-model-chip"}])
st("menu-repo-actions","Sidebar repo actions menu", ref(actions=[{"hover":"text=tide-web"},{"click":"[aria-label='tide-web actions']"}]), oc=[{"click":".sb-menu-trigger","text":"tide-web actions"}])
st("menu-help","Help menu", ref(actions=[{"click":"xpath=//button[@aria-label='Settings']/preceding::button[1]"}]), oc=[{"click":".sb-footer-btn","text":"Help"}])
HELP_REF={"click":"xpath=//button[@aria-label='Settings']/preceding::button[1]"}
HELP_OC={"click":".sb-footer-btn","text":"Help"}
st("dialog-submit-prompt","Help > Submit a prompt dialog", ref(actions=[HELP_REF,{"click":"[role=menuitem] >> text=Submit a prompt"}]), oc=[HELP_OC,{"click":"[role=menu] [role=menuitem]","text":"Submit a prompt","after_ms":800}], covers=[{"kind":"dialog","name":"Submit a prompt"}])
st("diagnostics-run","Diagnostics after a run", ref("/diagnostics", wait=False, actions=[{"click":"text=Run environment diagnostics"}], final_settle_ms=4000), oc=[HELP_OC,{"click":"[role=menu] [role=menuitem]","text":"Diagnostics","after_ms":800},{"click":".diag-btn-primary","after_ms":4000}])
st("toast-copied-link","Toast: copied link", ref(actions=[{"click":"text=tide-web"},{"rclick":"text=Ada/fix login redirect"},{"click":"[role=menu] >> text=Copy link"}], final_settle_ms=300), oc=[{"rclick":".sb-ws-name"},{"click":"[role=menu] [role=menuitem]","text":"Copy link","after_ms":200}])
st("sidebar-after-archive","Sidebar after archiving a workspace", ref(actions=[{"click":"text=tide-web"},{"rclick":"text=Ada/fix login redirect"},{"click":"[role=menu] >> text=Archive"}]), oc=[{"rclick":".sb-ws-name"},{"click":"[role=menu] [role=menuitem]","text":"Archive","after_ms":1000}])
# Conductor's reference opens on "/" (Home: wordmark and the Open project / Open GitHub
# project / Quick start cards) and stays there unless its actions open a workspace (Create
# is a dialog over Home). The seeded OpenConductor app opens on its workspace instead, so
# those states first go to OpenConductor's root view (Selection "root", the sidebar Home
# row) and both sides show the same scene behind the dialog, menu or toast. States whose
# own OpenConductor steps start by navigating (workspace, Home, Settings) are left as is.
def ref_leaves_home(a):
    return a.get("click", "").startswith("text=Ada/")
OC_NAVIGATES = [OPEN_WS[0], HOME[0], SETTINGS[0]]
for s in S:
    r = s.get("ref")
    if (r and r["path"] == "/" and r["scenario"] == "populated" and s.get("oc") and not s.get("oc_fresh")
            and not any(ref_leaves_home(a) for a in r["actions"]) and s["oc"][0] not in OC_NAVIGATES):
        s["oc"] = HOME + s["oc"]
json.dump({"schema":"openconductor.ui-map-states/1","viewport":{"width":1280,"height":820},"theme":"dark","states":S}, open(__import__('os').path.join(__import__('os').path.dirname(__file__),'states.json'),'w'), indent=1)
print(len(S))
