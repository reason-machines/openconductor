export const scenario = new URLSearchParams(location.search).get('scenario') ?? 'custom';
export const witness = {
  scenario, ready: false, opens: [] as { path: string; mode: string }[], closed: 0,
  searches: [] as { path: string; query: string; excludeDirectories: boolean }[],
  shortcuts: [] as unknown[], events: [] as object[], errors: [] as string[],
};
export async function fuzzyFilterFiles(path: string, query: string, excludeDirectories: boolean) {
  witness.searches.push({ path, query, excludeDirectories });
  return (scenario === 'empty' ? [] : ['src/first.ts', 'src/second.ts']).map(relative_path => ({
    file: { name: relative_path.split('/').pop()!, path: `/synthetic/${relative_path}`, is_directory: false },
    relative_path, match_indices: [], score: 1,
  }));
}
