export const witness = {
  fixture: 'CLONE-IMPLICIT-ENTER-6013/v1', calls: [] as unknown[], events: [] as unknown[], errors: [] as string[],
  shortcuts: [] as unknown, closed: 0, cloned: 0, capabilitySubmits: 0,
};
export async function githubGitProtocol() { return 'https'; }
export async function githubRecentRepos() { return []; }
export async function lastCloneDirectory() { return null; }
export async function folderExists() { return false; }
export async function defaultCloneDirectory() { return '/synthetic/clone-root'; }
export async function pickFolder() { throw new Error('Browse outside fixture scope'); }
export function saveLastCloneDirectory() { throw new Error('Unexpected persistence'); }
export async function cloneRepository(remoteUrl: string, target: string, name: string) {
  witness.calls.push({ remoteUrl, target, name, effect: 'inert pending Promise only' });
  document.getElementById('trace')!.textContent = JSON.stringify(witness, null, 2);
  return new Promise<never>(() => {});
}
