# Garry Mode shortcut hint

Conductor Rebuild owns SETTINGS49-GARRY-HINT-01. This is the frozen regression-only baseline. No product fix has been applied and behavioral reproduction is NOT_RUN until the automatic hosted job reports.

## Reference source and current main

The retained Conductor 0.87.6 General row renders `Ss` for `toggleGarryMode`. The consumer chain is `Ss → jde → Mde → useSyncExternalStore`. The verified aliases below join the renderer to the index override parser, snapshot, subscription and command resolver. `OQt → GUt → nh` selects the configured shortcuts before the registry default and supplies them back to `Ss` during render.

Reference assets are retained REA-extracted original application assets, not executed JavaScript. Producer evidence is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The retained acquisition receipt is `.rea-work/vse-init-source-refill/same49-vse-init-v1-receipt.json`. Full asset identities are:

- `renderApp-D_fmY7hW.js`, 11600457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js`, 3493297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

`python3 .rea-work/garry-shortcut-hint/qualify_source.py` passed both asset hashes, twelve exact spans, four import/export aliases, and eight source assertions against current main `167492e56dbbb90850efbadf1db2848dae7622f2`. These are static checks only.

Current main still computes `GARRY_HINT` once outside `GeneralAppPrefRows`, without overrides. `GeneralPage` already subscribes to the live override map. The smallest proposed fix is to pass that map into the row and resolve its hint during render. Product edits wait for the intended behavioral RED.

The current-main files checked are:

- `src/settings/rows/AppPrefRows.tsx`, 5149 bytes, SHA-256 `72a1f51c91bde5d9aaee54e82962507200bd2bd54de8cede2df5fca25524ef85`.
- `src/settings/GeneralPage.tsx`, 11134 bytes, SHA-256 `aa1a9a2eb0ef2d92485a2e14540c81f59eedfb7d860f7a9876284d2ad558d883`.
- `src/keybindings/KeybindingsProvider.tsx`, 5566 bytes, SHA-256 `991bcea35e8ed7873c7b4915972e699ca889b9c1eb43a098b8ed919ff70484d6`.
- `src/keybindings/overrides.ts`, 8207 bytes, SHA-256 `a0ba64d4994c485590972fdbd6dc47fe938c36203c8e084049e3c2e890820193`.
- `src/keybindings/registry.ts`, 28780 bytes, SHA-256 `3a873cc27d99b73fafa340dc1585d9f4cd850966e91408c4f4dbad445bf4dcb9`.

## Frozen mounted regression

`src/settings/garryShortcutHint.test.ts` has SHA-256 `eb2d41c65f0de8d5429723ef0a6381f73772d5a6767809d2cfabb6db6bc8f2cd`.

The earlier offline candidate had SHA-256 `8d20554d4c5348fe0fab2fb5ead785fd2f914088b4d38ae8683c3b493279fbf5`. Before the first execution, its own-property check was made compatible with the repository's ES2021 library by replacing `Object.hasOwn` with `Object.prototype.hasOwnProperty.call`. No expectation changed.

The test mounts the actual `GeneralAppPrefRows` and actual `KeybindingsProvider`. It uses the real override parser, shortcut resolver, and glyph formatter. The row layout and preference/native I/O are controlled dependencies. A thin mounted wrapper supplies the provider's live overrides to the row.

Six cases cover default shortcuts, saved overrides loaded after mount, a live remap, multiple shortcuts, reset to defaults, and the unchanged preference-write payload. Predicted baseline is three behavioral failures for loaded, live, and multiple overrides, with three controls passing. A syntax, loader, dependency, or typecheck failure does not qualify as behavioral RED.

The ordinary automatic CI workflow runs `npm run typecheck` before `node --test "src/**/*.test.ts"`. The focused equivalent is:

`node --experimental-strip-types --test --test-reporter=tap src/settings/garryShortcutHint.test.ts`

No local Node process, browser, original app, or native runtime has been admitted. There is no manual workflow dispatch or rerun. After a valid RED, the same test bytes must pass with the minimum production change. The complete caller and exact-head workflows also need verification before merge.

## Original source joins

Renderer to index aliases are:

- `wYe` imports `cV`, exported as `OQt`.
- `K4r` imports `cY`, exported as `zfe`.
- `WTn` imports `cX`, exported as `bQt`.
- `q4r` imports `cW`, exported as `SQt`.

### general-garry-row

Asset `renderer`, UTF-8 half-open bytes 10716389 to 10716898, SHA-256 `99a7e24a6c2b17e5e71d3521f23df50383dd3b5a3ba99350ac940a16664b46d1`.

```javascript
ir({tab:"general",settingKey:"garry_mode",scopes:["user"],title:"Don't collapse tool calls (Garry Mode)",description:"Show all tool calls expanded by default instead of collapsed.",enableViaDeepLink:!0,render:function({title:e,description:n,settingKey:i}){const{data:r}=us("garry_mode");return p.jsx(Zb,{settingKey:i,id:"garry-mode",title:e,description:p.jsxs(p.Fragment,{children:[n," Toggle with"," ",p.jsx(Ss,{commandId:"toggleGarryMode"}),"."]}),checked:r,onCheckedChange:o=>{Isi(o).fireAndForget()}})}}),
```

### shortcut-component

Asset `renderer`, UTF-8 half-open bytes 2117989 to 2118414, SHA-256 `9f79ade31ae59c83e8605a9a80cc8568defcd00175eb0e0a651d189e799de3f9`.

```javascript
function Ss(t){const e=ne.c(9),{commandId:n,className:i}=t,r=jde(n);let o;e[0]!==r?(o=r?[r.key,...r.additionalKeys??[]]:[],e[0]=r,e[1]=o):o=e[1];const a=o;if(a.length===0)return null;let c;e[2]!==i?(c=Xe("inline-flex items-center ml-auto pl-1",i),e[2]=i,e[3]=c):c=e[3];let u;e[4]!==a?(u=a.map(Vls),e[4]=a,e[5]=u):u=e[5];let d;return e[6]!==c||e[7]!==u?(d=p.jsx("span",{className:c,children:u}),e[6]=c,e[7]=u,e[8]=d):d=e[8],d}
```

### override-command-hook

Asset `renderer`, UTF-8 half-open bytes 2116331 to 2116446, SHA-256 `143bbd76c1ac2000ab364f9fe29d76ef0884048338c3a89ca9d72e41faacc14e`.

```javascript
function jde(t){const e=ne.c(3),n=Mde();let i;return e[0]!==t||e[1]!==n?(i=wYe(t,n),e[0]=t,e[1]=n,e[2]=i):i=e[2],i}
```

### override-subscription-hook

Asset `renderer`, UTF-8 half-open bytes 2116206 to 2116331, SHA-256 `6ba3e7d736e6f61ae0f68f9c894099b2f6a7e91eb0b5fa5cb85e1a8397b75eef`.

```javascript
function Mde(){const t=ne.c(2),e=$.useSyncExternalStore(q4r,WTn,WTn);let n;return t[0]!==e?(n=K4r(e),t[0]=e,t[1]=n):n=t[1],n}
```

### override-store-binding

Asset `index`, UTF-8 half-open bytes 3388902 to 3389049, SHA-256 `e2f5dcbc7fa023726e19ce7fc81ea52ef8890f162906c78dcbd56ea67f333b94`.

```javascript
function EUt({storage:t}){HY?.(),gu=t;const e=ud;ud=t.getSnapshot(),HY=t.subscribe(()=>{const s=t.getSnapshot();s!==ud&&(ud=s,qY())}),ud!==e&&qY()}
```

### override-subscribe

Asset `index`, UTF-8 half-open bytes 3389049 to 3389101, SHA-256 `79bc4a46132d81816c529e4e2a6aedb4cd3c22f9299f3b46236f89068541a062`.

```javascript
function SQt(t){return pL.add(t),()=>{pL.delete(t)}}
```

### override-snapshot

Asset `index`, UTF-8 half-open bytes 3389101 to 3389126, SHA-256 `53907b1ee09f0cb9184b86d4d3a6666a79009a233482a361f763b71470920516`.

```javascript
function bQt(){return ud}
```

### override-parse

Asset `index`, UTF-8 half-open bytes 3391333 to 3392168, SHA-256 `65c80a74bc9d0b93cee05d5ae2df4e0d514970672676854a27ae7e072070a590`.

```javascript
function zfe(t,e){if(t===void 0)return{};let s;try{s=JSON.parse(t)}catch{return{}}if(typeof s!="object"||s===null)return{};if(!("version"in s)||s.version!==1)return{};if(!("overrides"in s)||typeof s.overrides!="object"||s.overrides===null)return{};const n={},r=new Map(Object.entries(s.overrides));for(const[c,l]of r){if(zY[c]!==void 0)continue;const u=c;if(!IUt(u)||!V_[u].configurable||n[u]!==void 0)continue;const d=GY(l);d!==void 0&&(n[u]=d)}const i=GY(r.get("workspace.contextMenu.togglePinOrImportance"));n["workspace.contextMenu.togglePin"]===void 0&&i!==void 0&&(n["workspace.contextMenu.togglePin"]=i);const o=e?.legacyMessageSendKey??"enter",a=["chat.composer.submitWithCommandEnter",...OUt[o]];for(const c of a){const l=zY[c];if(l===void 0||n[l]!==void 0)continue;const u=fL(r.get(c));u!==void 0&&(n[l]=[u])}return DUt(n),n}
```

### effective-shortcuts

Asset `index`, UTF-8 half-open bytes 3393483 to 3393608, SHA-256 `278fa92a1196832de0fd6002ab85c9e1fcbdcf6455591306c5d094efa4f2fd4b`.

```javascript
function nh(t,e){const n=(e?.overrides??WUt())[t];if(n!==void 0)return n;const r=V_[t];return[r.key,...r.additionalKeys??[]]}
```

### effective-command

Asset `index`, UTF-8 half-open bytes 3395365 to 3395468, SHA-256 `960560ca020d62330420c933fcca248b9c8a412ff93654edf29b9f5c9febdd8a`.

```javascript
function GUt(t,e){const s=V_[t],[n,...r]=nh(t,e);return{...s,key:n,additionalKeys:r.length>0?r:void 0}}
```

### effective-command-export

Asset `index`, UTF-8 half-open bytes 3395496 to 3395542, SHA-256 `519af7ef64da23b68db0d529e2e644e1e28ec629f754fd65dc20abd4c7883562`.

```javascript
function OQt(t,e){return GUt(t,{overrides:e})}
```

### garry-command-registration

Asset `index`, UTF-8 half-open bytes 3363376 to 3363570, SHA-256 `b86a19c4df43f1505259437399a91c123386f559df07dc62ff4ea469a4a0cb89`.

```javascript
toggleGarryMode:{id:"toggleGarryMode",key:he({key:"o",modifiers:so}),title:"Toggle Garry mode (expand tool calls)",configurable:!0,category:"General",when:{isGlobal:!0,enableOnTerminalFocus:!1}}
```

## Limits

The inherited REA semantic-renderer heap-exhaustion gap remains recorded. No fresh REA invocation or new REA error occurred in this bounded rebind. Static source proof does not establish original-app execution.

Mounted RED and GREEN, typecheck, complete exact-head workflows, package consumption, browser screenshot, and native acceptance are NOT_RUN at this baseline. The mounted wrapper is not the complete Settings page. No native geometry, provider, authentication, or IME acceptance is claimed. A screenshot is unavailable because browser/native execution is not admitted for this source-only lane.

Ligatures remain unresolved with no established defect and are excluded. No app preference write logic, registry, numeric menu, native admission, or protected Mac resource changes are included.

Test Behavior, Not Implementation keeps the assertion on the mounted row's help and preference payload. Laziness Protocol keeps the proposed fix to existing live state rather than adding another subscription or store.
