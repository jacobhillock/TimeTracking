import { Toast } from "@base-ui-components/react/toast";

type ToastType = "error" | "success" | "loading";

interface QueuedToast {
  title: string;
  description: string;
  type: ToastType;
}

export const toastManager = Toast.createToastManager();

const pendingToasts: QueuedToast[] = [];
let toastSystemReady = false;

const enqueueToast = (toast: QueuedToast): void => {
  if (!toastSystemReady) {
    pendingToasts.push(toast);
    return;
  }

  toastManager.add(toast);
};

export const markToastSystemReady = (): void => {
  toastSystemReady = true;

  while (pendingToasts.length > 0) {
    const toast = pendingToasts.shift();
    if (toast) {
      toastManager.add(toast);
    }
  }
};

export const notifyErrorToast = (title: string, description: string): void => {
  enqueueToast({
    title,
    description,
    type: "error",
  });
};

export const notifyStorageParseFailure = (key: string): void => {
  notifyErrorToast("Settings reset", `Invalid saved value for "${key}". Using defaults.`);
};
