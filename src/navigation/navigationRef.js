import { createNavigationContainerRef } from '@react-navigation/native';

// Lets code outside the component tree (syncEngine, App's own AppState
// listener) force a redirect to Login after a session expires, without
// prop-drilling `navigation` into non-screen modules.
export const navigationRef = createNavigationContainerRef();

export function resetToLogin() {
  if (navigationRef.isReady()) {
    navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
  }
}
