import { getDB, TODO_STORE_NAME } from './db';
import type { Todo } from './types';

export async function getAllTodos(dateKey: string): Promise<Todo[]> {
  try {
    const db = await getDB();
    const keys = await db.getAllKeys(TODO_STORE_NAME);
    const tx = db.transaction(TODO_STORE_NAME, 'readonly');
    const todos: Todo[] = [];
    
    for (const key of keys) {
      const todo = await tx.store.get(key);
      if (todo && (!todo.completed || (todo.completed && todo.completedDate === dateKey))) {
        todos.push({ ...todo, id: key as number });
      }
    }

    await tx.done;
    
    return todos;
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
    const db = await getDB();
    const id = Date.now();
    const dateStr = (createdDate || new Date().toISOString().split('T')[0]) as string;
    const todo: Todo = {
      id,
      description,
      client: client || undefined,
      ticket: ticket || undefined,
      completed: false,
      createdDate: dateStr,
    };
    
    await db.put(TODO_STORE_NAME, todo, id);
    return todo;
  } catch (error) {
    console.error('Failed to add todo:', error);
    return null;
  }
}

export async function toggleTodoCompletion(id: number): Promise<boolean> {
  try {
    const db = await getDB();
    const todo = await db.get(TODO_STORE_NAME, id);
    
    if (!todo) {
      console.error('Todo not found:', id);
      return false;
    }

    const updatedTodo: Todo = {
      ...todo,
      completed: !todo.completed,
      completedDate: !todo.completed
        ? new Date().toISOString().split('T')[0]
        : undefined,
    };

    await db.put(TODO_STORE_NAME, updatedTodo, id);
    return true;
  } catch (error) {
    console.error('Failed to toggle todo completion:', error);
    return false;
  }
}

export async function deleteTodo(id: number): Promise<boolean> {
  try {
    const db = await getDB();
    await db.delete(TODO_STORE_NAME, id);
    return true;
  } catch (error) {
    console.error('Failed to delete todo:', error);
    return false;
  }
}

export async function updateTodo(id: number, description: string, client?: string, ticket?: string): Promise<boolean> {
  try {
    const db = await getDB();
    const todo = await db.get(TODO_STORE_NAME, id);
    
    if (!todo) {
      console.error('Todo not found:', id);
      return false;
    }

    const updatedTodo: Todo = {
      ...todo,
      description,
      client,
      ticket,
    };

    await db.put(TODO_STORE_NAME, updatedTodo, id);
    return true;
  } catch (error) {
    console.error('Failed to update todo:', error);
    return false;
  }
}
