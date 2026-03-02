import { useEffect } from 'react'
import { Toast } from '@base-ui-components/react/toast'
import { markToastSystemReady, toastManager } from '../services/toastService'

function ToastList() {
  const { toasts } = Toast.useToastManager()

  useEffect(() => {
    markToastSystemReady()
  }, [])

  return (
    <>
      {toasts.map((toastItem) => (
        <Toast.Root
          key={toastItem.id}
          toast={toastItem}
          className={`app-toast ${toastItem.type === 'error' ? 'app-toast-error' : ''}`}
        >
          <Toast.Title className="app-toast-title" />
          <Toast.Description className="app-toast-description" />
          <Toast.Close className="app-toast-close" aria-label="Close toast">
            x
          </Toast.Close>
        </Toast.Root>
      ))}
    </>
  )
}

function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager} limit={5}>
      <Toast.Portal>
        <Toast.Viewport className="app-toast-viewport">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}

export default Toaster
