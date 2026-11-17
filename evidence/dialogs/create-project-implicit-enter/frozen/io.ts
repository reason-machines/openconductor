export const witness = {
  fixture: 'CREATE-PROJECT-IMPLICIT-ENTER-6013/v1', calls: [] as unknown[], events: [] as unknown[], errors: [] as string[],
  shortcuts: [] as unknown, closed: 0, completed: 0, capabilitySubmits: 0,
};
export async function lastCloneDirectory() { return null; }
export async function folderExists() { return false; }
export async function defaultCloneDirectory() { return '/synthetic/project-root'; }
export async function pickFolder() { throw new Error('Browse is outside fixture scope'); }
export function saveLastCloneDirectory() { throw new Error('Unexpected preference persistence'); }
export function saveRepoScripts() { throw new Error('Unexpected script persistence'); }
export function addRepository() { throw new Error('Unexpected repository registration'); }
export function createFirstWorkspace() { throw new Error('Unexpected workspace creation'); }
export async function createNewProject(request: { parentDir: string; slug: string; template: string }) {
  witness.calls.push({ ...request, effect: 'inert pending Promise only' });
  document.getElementById('trace')!.textContent = JSON.stringify(witness, null, 2);
  return new Promise<never>(() => {});
}
