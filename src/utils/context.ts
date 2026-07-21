import { AsyncLocalStorage } from 'async_hooks';

export const contextStorage = new AsyncLocalStorage<Map<string, any>>();

/**
 * Retrieve the active request's language ('en' or 'hi') from context storage.
 * Defaults to 'en' if not set.
 */
export const getLanguage = (): string => {
    const store = contextStorage.getStore();
    return store?.get('language') || 'en';
};
