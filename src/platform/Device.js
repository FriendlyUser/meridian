// What the app is running on.

/** Inside the Android (or iOS) app built with Capacitor, rather than a browser tab. */
export const isNative = () => !!(/** @type {any} */ (window).Capacitor?.isNativePlatform?.());

/** A phone or tablet: the main pointer is a finger. */
export const touchFirst = () => isNative() || (!!window.matchMedia?.('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);
