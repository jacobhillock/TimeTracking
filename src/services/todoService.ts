import {
  addRecord,
  fromTodoRecord,
  deleteRecord,
  getAllByIndex,
  getByKey,
  putRecord,
  toTodoRecord,
  TODO_INDEX_COMPLETED,
  TODO_INDEX_COMPLETED_DATE,
  TODO_COMPLETED_FALSE,
  TODO_STORE_NAME,
} from './db';
import type { Todo } from './types';

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getAllTodos(dateKey: string): Promise<Todo[]> {
  try {
    const [activeTodos, completedTodayTodos] = await Promise.all([
      getAllByIndex(TODO_STORE_NAME, TODO_INDEX_COMPLETED, TODO_COMPLETED_FALSE),
      getAllByIndex(TODO_STORE_NAME, TODO_INDEX_COMPLETED_DATE, dateKey),
    ]);
    const mergedTodos = new Map<number, Todo>();

    for (const todo of [...activeTodos, ...completedTodayTodos]) {
      const publicTodo = fromTodoRecord(todo);
      mergedTodos.set(publicTodo.id, publicTodo);
    }

    return Array.from(mergedTodos.values()).filter((todo) => {
      return !todo.completed || todo.completedDate === dateKey;
    });
  } catch (error) {
    console.error('Failed to get all todos:', error);
    return [];
  }
}

export async function addTodo(
  description: string,
  client?: string,
  ticket?: string,
  createdDate?: string
): Promise<Todo | null> {
  try {
    const id = Date.now();
    const dateStr = createdDate || formatLocalDate(new Date());
    const todo: Todo = {
      id,
      description,
      client: client || undefined,
      ticket: ticket || undefined,
      completed: false,
      createdDate: dateStr,
    };

    await addRecord(TODO_STORE_NAME, toTodoRecord(todo), id);
    return todo;
  } catch (error) {
    console.error('Failed to add todo:', error);
    return null;
  }
}

export async function toggleTodoCompletion(id: number): Promise<boolean> {
  try {
    const storedTodo = await getByKey(TODO_STORE_NAME, id);

    if (!storedTodo) {
      console.error('Todo not found:', id);
      return false;
    }

    const todo = fromTodoRecord(storedTodo);
    const updatedTodo: Todo = {
      ...todo,
      completed: !todo.completed,
      completedDate: !todo.completed
        ? formatLocalDate(new Date())
        : undefined,
    };

    await putRecord(TODO_STORE_NAME, toTodoRecord(updatedTodo), id);
    return true;
  } catch (error) {
    console.error('Failed to toggle todo completion:', error);
    return false;
  }
}

export async function deleteTodo(id: number): Promise<boolean> {
  try {
    await deleteRecord(TODO_STORE_NAME, id);
    return true;
  } catch (error) {
    console.error('Failed to delete todo:', error);
    return false;
  }
}

export async function updateTodo(id: number, description: string, client?: string, ticket?: string): Promise<boolean> {
  try {
    const storedTodo = await getByKey(TODO_STORE_NAME, id);

    if (!storedTodo) {
      console.error('Todo not found:', id);
      return false;
    }

    const todo = fromTodoRecord(storedTodo);
    const updatedTodo: Todo = {
      ...todo,
      description,
      client,
      ticket,
    };

    await putRecord(TODO_STORE_NAME, toTodoRecord(updatedTodo), id);
    return true;
  } catch (error) {
    console.error('Failed to update todo:', error);
    return false;
  }
}
