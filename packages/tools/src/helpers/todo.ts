export interface TodoItem {
  id: string;
  description: string;
  state: "pending" | "in_progress" | "completed";
}

export function formatTodoIds(todos: TodoItem[]): string {
  if (todos.length === 0) return "No todos.";
  return todos
    .map((t) => `[${t.state}] ${t.id}: ${t.description}`)
    .join("\n");
}
